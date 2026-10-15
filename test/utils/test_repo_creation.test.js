import { describe, expect, it } from "vitest";
import {
  createRepositoryNameRules,
  validateRepositoryName,
} from "@/utils/repo-creation";

describe("repository creation policy", () => {
  it.each(["a", "model.v1", "my-model", "my_model", "Model3"])(
    "accepts the backend-supported name %s without a two-character minimum",
    (name) => expect(validateRepositoryName(name)).toBeNull(),
  );

  it.each(["", "   ", "bad/name", "bad\n", "café", null])(
    "rejects an empty or unsupported UI name %s",
    (name) => expect(validateRepositoryName(name)).toEqual(expect.any(String)),
  );

  // The server applies the Hub's rule (cheesecave-backend#98): the one
  // huggingface_hub's validate_repo_id mirrors. The form says so before the
  // request instead of after it.
  it.each([
    "_x",
    "x_",
    "a.b",
    "Foo-BAR_foo.bar123",
    "1.2.3",
    "a.git.b",
    "x".repeat(96),
  ])("accepts %s, which the server takes", (name) =>
    expect(validateRepositoryName(name)).toBeNull(),
  );

  it.each([
    ["-a", /start or end/],
    ["a-", /start or end/],
    [".a", /start or end/],
    ["a.", /start or end/],
    ["a--b", /-- or \.\./],
    ["a..b", /-- or \.\./],
    ["foo.git", /\.git/],
    ["x".repeat(97), /96/],
    ["a b", /letters, numbers/],
    ["bad/name", /letters, numbers/],
  ])("refuses %s and says why", (name, why) =>
    expect(validateRepositoryName(name)).toMatch(why),
  );

  it("says the same through the form field's rule", () => {
    const [rule] = createRepositoryNameRules();
    const answers = [];
    rule.validator(rule, "a--b", (error) => answers.push(error));
    rule.validator(rule, "model.v1", (error) => answers.push(error));
    expect(answers[0]).toBeInstanceOf(Error);
    expect(answers[0].message).toMatch(/-- or \.\./);
    expect(answers[1]).toBeUndefined();
  });
});
