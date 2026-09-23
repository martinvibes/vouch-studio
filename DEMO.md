# Demo video script (about 2.5 minutes)

Record at 1440×900, light theme. Start a shootout before recording one so you have a finished one to cut to if the live one runs long.

**0:00 · The problem (Studio page)**
"Livepeer gives you dozens of image and video models behind one API. Which one should render *this* shot? Prices differ twenty-fold and vendor samples are cherry-picked. Vouch Studio answers with evidence."

**0:15 · Plan (click the "Bakery sign" example)**
"I describe the shot: a sign reading FRESH BAGELS above exactly four bagels. Vouch reads it as a typography brief and proposes a lineup from its Board: the best model for this kind of shot, the best value, and a challenger it hasn't tested much. Each card shows the live Livepeer price, network latency and success rate. I can swap any of them."

**0:35 · Run (click Run the shootout)**
"Three models render in parallel on Livepeer. Meanwhile a text model on Livepeer has turned my brief into a checklist: the exact words, the count of four, the lighting."

**0:55 · Verdict (stamps land)**
"As each render lands, a vision model on Livepeer grades it blind, without knowing which model made it. Green ticks are met; here it counted only two bagels, so that requirement fails and the score drops. Craft, aesthetics, cost and speed roll into one Vouch score. The winner gets the seal."

**1:20 · Human in the loop**
"I can disagree: 'I prefer this one' records my pick next to the judge's, and the Board publishes how often people agree with the judge."

**1:30 · Refine (Refine this render → type feedback → Run round 2)**
"I want the lettering in gold. Vouch turns my feedback into new checklist items, rewrites the prompt, and runs round two on the same model. The trail at the top shows the score change round over round."

**1:55 · The Board (open /board, click Typography, then a model)**
"Every shootout feeds the Board: models ranked by graded renders, overall and per kind of shot, with cost per usable render, latency and win rate. Nothing here is self-reported."

**2:15 · For agents (open /api-docs)**
"And it's an API. Another agent can ask 'what's the best typography model under two cents?' before spending anything, or run a shootout and read the verdict as JSON."

**2:25 · Close**
"Vouch Studio: every render and every verdict runs on Livepeer. Pick the right model for every shot."
