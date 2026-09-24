# Demo video script (1:45)

Record at 1440×900 in the light theme.

**Before you hit record**

1. Run one image shootout (the "Bakery sign" example) so a finished result is ready to cut to while renders load.
2. Connect Claude Code to Vouch: `claude mcp add --transport http vouch-studio https://web-production-e90e7.up.railway.app/api/mcp`
3. Run the agent prompt from 1:18 once in advance and keep that terminal open, so you can show the answer without waiting.

| Time | On screen | What you say |
| --- | --- | --- |
| 0:00–0:12 | **Home page.** Let the hero play: the headline presses in, the brief types, the grade stamps land. | "Livepeer has dozens of image and video models. Prices vary twentyfold, and samples are cherry-picked. So which one should render *your* shot? Vouch Studio makes them prove it." |
| 0:12–0:24 | **Click "Run a shootout"**, then the **"Bakery sign"** example. The lineup cards appear. | "I describe the shot: a sign reading FRESH BAGELS, with exactly four bagels. Vouch proposes three models, each with its live Livepeer price, speed and success rate." |
| 0:24–0:34 | **Click "Run the shootout".** The results page opens and the renders load. | "All three render at once on Livepeer. Meanwhile, a text model turns my brief into a checklist: the exact words, the count, the light." |
| 0:34–0:52 | **Grade stamps land.** Point at a green tick, then a red cross, then the seal. | "A vision model grades each render blind. It never sees the model's name. Here, one model drew the wrong number of bagels, so it loses points. Quality, cost and speed become one score, and the winner gets the Vouch seal." |
| 0:52–1:04 | **Click "Refine this render"**, type *"make the lettering gold"*, click **"Run round 2"**. | "Want changes? I give feedback. Vouch adds it to the checklist, rewrites the prompt and runs round two. The trail at the top shows the score change." |
| 1:04–1:18 | **Open the Board**, click **Typography**, then click a model name. | "Every shootout feeds the Board: models ranked by real, graded renders, with cost per usable render, speed and reliability. Nothing here is self-reported." |
| 1:18–1:38 | **Claude Code terminal.** Show the prompt: *"Use vouch-studio to find the best model for a poster reading VISIT LISBON, then run a shootout."* Cut to the answer. | "And it's an MCP server. Any agent, like Claude Code, connects with one line, asks which model to use under a budget, runs a shootout and gets the verdict back, with the evidence." |
| 1:38–1:45 | **Back to the home page hero.** | "Vouch Studio. The right model for every shot, proven on Livepeer." |
