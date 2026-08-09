# ECC Upstream Policy

Nokta uses ECC as an upstream inspiration and future fork base, not as a giant
runtime prompt dump.

## Sources

- ECC repository: https://github.com/affaan-m/ecc
- Shortform guide: https://raw.githubusercontent.com/affaan-m/ECC/main/the-shortform-guide.md
- Longform guide: https://raw.githubusercontent.com/affaan-m/ECC/main/the-longform-guide.md
- Security guide: https://raw.githubusercontent.com/affaan-m/ECC/main/the-security-guide.md

## Import Rules

- Import skills and agents only after assigning a Nokta pack category.
- Keep noisy, duplicate, or overly narrow capabilities disabled by default.
- Preserve source references for imported material.
- Prefer compact summaries over copying long instructions into compiled context.
- Do not enable large MCP/tool surfaces by default.

## Nokta Additions

- Mandatory trail files.
- Hard completion gates.
- Adapter-specific compiled context.
- Stack-aware pack selection.
- Security and token budget checks.
