/**
 * Guard for `git add .` in the PR step.
 *
 * `git add .` stages every untracked path, so any secret that is not covered
 * by .gitignore is silently committed and pushed. .gitignore differs per
 * branch, and this repository's main branch has no .env rule, so the daemon
 * refuses to proceed rather than relying on the ignore file being right.
 *
 * `.env.example` and friends are intentionally committable templates.
 * Extensions are enumerated rather than wildcarded so ordinary source files
 * (credentials.js, env.js, keyboard.js) are not flagged.
 */
const SECRET_PATTERN =
  /(^|\/)(\.env(\.(?!example|sample|template)[^/]*)?|\.npmrc|\.netrc|.*\.(pem|key|p12|pfx|keystore)|id_(rsa|dsa|ecdsa|ed25519)|credentials(\.(json|ya?ml|ini|cfg|txt))?|secrets?\.(json|ya?ml))$/i;

export function isSecretLikePath(filePath) {
  if (!filePath) return false;
  return SECRET_PATTERN.test(filePath.trim());
}

/**
 * Extract secret-like paths from `git status --porcelain` output.
 *
 * Porcelain v1 format is `XY <path>`, or `XY <orig> -> <dest>` for renames.
 * The path always begins at offset 3.
 */
export function findSecretLikePaths(porcelain) {
  if (!porcelain) return [];
  return String(porcelain)
    .split('\n')
    .map((line) => {
      if (line.length < 4) return '';
      // Take the destination of a rename, which is what would actually be staged.
      const rest = line.slice(3);
      const arrow = rest.indexOf(' -> ');
      return (arrow === -1 ? rest : rest.slice(arrow + 4)).trim();
    })
    .filter((p) => p && isSecretLikePath(p));
}
