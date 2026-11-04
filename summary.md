# STRAIX challenge – summary

- Wrote a Node.js + Playwright script that drives a real Chromium browser; no direct API calls.
- Logged in by filling the Username/Password fields and clicking "Sign in".
- Explore pass: crawled the portal (Workspace → Open records → cases 1–5), dumping each page's text, links, buttons, inputs and hidden content.
- Found that only the "1+1" record (/cases/4) has a "Load answer" button, an answer field and "Submit answer"; the other records say "No answer".
- Solve pass: logged in, clicked "Open records" → "1+1" → "Load answer", then read the newly rendered text from the page.
- The loaded answer was `111-4543F784B6B6DDEC` (not literally "2"); the script typed it into the Answer field.
- Clicked "Submit answer" immediately, in the same authenticated browser session; the page returned "Accepted".