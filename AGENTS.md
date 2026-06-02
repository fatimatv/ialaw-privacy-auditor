# IALAW Privacy Audit Engine — Codex Instructions

## Product purpose

Build a deterministic, rule-based web audit app for personal data protection compliance review.

The legal rules already exist in `src/analyzer/index.ts`. Do not rewrite, dilute, or replace their legal meaning.

## Non-negotiables

- Do not use OpenAI API.
- Do not use external compliance APIs.
- Do not add SaaS API integrations.
- Do not create legal rules from scratch.
- Do not submit forms.
- Do not bypass authentication.
- Do not scan private areas.
- Do not perform vulnerability exploitation.
- Do not claim full legal certification.
- The app must only analyze public, observable website evidence.

## Runtime rule

The production app must work without API keys. The only network access allowed at runtime is visiting the target public website.

## Brand

Apply IALAW identity in the web UI and PDF:

- Primary blue: #011EF4.
- Accent yellow: #FBBB02.
- Neutral gray: #6F7072.
- White: #FFFFFF.
- Use bold blue/white contrast.
- Use restrained yellow accents.
- Use rounded cards and clean legal-tech layouts.
- Use uppercase, high-impact headings.
- Use horizontal logo in web headers and PDF inner pages.
- Use vertical logo on PDF cover.
- Do not use gavels, scales, or generic legal clichés.

## Technical style

- TypeScript.
- Next.js App Router.
- Playwright for crawling, screenshots, and PDF generation.
- Deterministic rule engine.
- Unit tests for detectors and analyzer.
- Clear separation:
  - crawler
  - extractor
  - analyzer
  - report
  - web UI

## Legal disclaimer required in PDF

"This report is based on evidence observable from public web pages and on the rule set selected by the user. It does not constitute a full legal certification of compliance and should be complemented with documentary, contractual, organizational and technical evidence when applicable."