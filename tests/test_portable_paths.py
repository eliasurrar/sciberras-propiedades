"""Verify scripts use the relocated checkout, independently of cwd."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class PortablePathsTest(unittest.TestCase):
    def test_scripts_resolve_relocated_checkout(self):
        with tempfile.TemporaryDirectory(prefix="sciberras relocated ") as folder:
            root = Path(folder) / "checkout"
            shutil.copytree(Path(__file__).resolve().parents[1] / "scripts", root / "scripts")
            data = root / "docs/data/listings.json"
            data.parent.mkdir(parents=True)
            data.write_text(json.dumps({"listings": []}))
            for name in ("publish", "unpublish", "activate", "offer", "seo_helpers"):
                with self.subTest(script=name):
                    code = "import runpy,sys; from pathlib import Path; m=runpy.run_path(sys.argv[1]); assert Path(m['ROOT']) == Path(sys.argv[2]).resolve()"
                    result = subprocess.run([sys.executable, "-B", "-c", code,
                                             str(root / "scripts" / (name + ".py")), str(root)],
                                            cwd=folder, capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)
            result = subprocess.run([sys.executable, "-B", str(root / "scripts/inspect.py")],
                                    cwd=folder, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("Total: 0 publicaciones", result.stdout)


if __name__ == "__main__":
    unittest.main()
