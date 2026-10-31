import copy, importlib.util, json, pathlib, tempfile, unittest
from types import SimpleNamespace
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'scripts'))
import publish
from validate import validate, validate_learning
ROOT = pathlib.Path(__file__).resolve().parents[1]

class PublishingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        self.old = publish.DATA, publish.ARTICLES
        publish.DATA = self.root
        publish.ARTICLES = self.root / 'articles'
        publish.ARTICLES.mkdir()
        for name in ('index', 'curriculum', 'status'):
            (self.root / (name+'.json')).write_bytes((ROOT/'data'/(name+'.json')).read_bytes())
        self.article = json.loads((ROOT/'data/articles/sociocultural-theory.json').read_text())
        # Use an existing structurally valid article as a prospective next concept.
        c = publish.next_concept()
        self.article.update({k:c[k] for k in ('id','day','titleZh','titleEn','stageId','theme','type')})
        self.article.update(date=publish.today_str(), oneLiner='先前形成的知识既是新学习的资源，也可能形成需要识别和调整的误解。')
        idx=publish.index()
        for a in idx['articles']: a['date']='2026-10-01'
        publish.dump(self.root/'index.json',idx)
        self.src=self.root/'draft.json';publish.dump(self.src,self.article)
        self.args=SimpleNamespace(article=str(self.src),dry_run=True,update=False,backfill=False,no_verify=True)
    def tearDown(self):
        publish.DATA,publish.ARTICLES=self.old;self.temp.cleanup()
    def snapshot(self):
        return {str(p.relative_to(self.root)):p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
    def test_dry_run_is_read_only(self):
        before=self.snapshot(); self.assertEqual(publish.cmd_publish(self.args),0);self.assertEqual(self.snapshot(),before)
    def test_ui_drift_blocks_before_content_write(self):
        before=self.snapshot(); original=publish.check_ui
        try:
            publish.check_ui=lambda root: ["theme changed"]
            self.assertEqual(publish.cmd_publish(self.args),2)
            self.assertEqual(self.snapshot(),before)
        finally:publish.check_ui=original
    def test_orphan_article_is_not_overwritten(self):
        (publish.ARTICLES/(self.article['id']+'.json')).write_text('original')
        before=self.snapshot();self.assertEqual(publish.cmd_publish(self.args),2);self.assertEqual(before,self.snapshot())
    def test_same_day_rejected(self):
        idx=publish.index();idx['articles'][0]['date']=publish.today_str();publish.dump(self.root/'index.json',idx)
        self.assertEqual(publish.cmd_publish(self.args),2)
    def test_update_disabled(self):
        self.args.update=True;self.assertEqual(publish.cmd_publish(self.args),2)
    def test_curriculum_mismatch(self):
        self.article['day']=29;publish.dump(self.src,self.article);self.assertEqual(publish.cmd_publish(self.args),2)
    def test_invalid_date(self):
        self.article['date']='2026-02-30';self.assertTrue(validate(self.article)[0])
    def test_companions(self):
        for path in (ROOT/'data/companions').glob('*.json'):
            if path.stem!='index':self.assertEqual(validate_learning(json.loads(path.read_text())),[],path.name)

if __name__=='__main__': unittest.main()
