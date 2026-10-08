import pathlib
import re
import unittest

WORKFLOW = pathlib.Path(__file__).resolve().parents[2] / ".github/workflows/publish-image.yml"


class PublishImageWorkflow(unittest.TestCase):
    def setUp(self):
        self.text = WORKFLOW.read_text(encoding="utf-8")

    def test_publishes_to_the_org_package(self):
        self.assertIn("IMAGE: ghcr.io/cheesecave/cheesecave-web\n", self.text)
        self.assertIn("packages: write", self.text)

    def test_pull_requests_only_build(self):
        self.assertIn("push: ${{ github.event_name != 'pull_request' }}", self.text)
        self.assertIn("if: github.event_name != 'pull_request'", self.text)

    def test_actions_are_pinned_to_commits(self):
        for ref in re.findall(r"uses: \S+@(\S+)", self.text):
            self.assertRegex(ref, r"^[0-9a-f]{40}$")


if __name__ == "__main__":
    unittest.main()
