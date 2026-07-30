# Voice Replication Pipeline: Final Research Synthesis

**Audience:** the engineer who already shipped v1 of this pipeline.
**Purpose:** tell you what to change, what to leave alone, and what nobody knows.

**Confidence tags used throughout:**

- `[VERIFIED]` peer-reviewed and independently re-checked against the source PDF in the adversarial pass
- `[PEER-REVIEWED]` published at a real venue, not re-checked
- `[PREPRINT]` arXiv only, not peer-reviewed, not re-checked
- `[CONVENTION]` a recurring design belief in published work with no ablation behind it
- `[UNMEASURED]` nobody has measured this

**Verification coverage, stated plainly.** Four of fourteen authorship-representation findings were adversarially verified. Three of the four were overturned. Zero pipeline-decomposition findings were verified at all. Treat every unverified claim below at roughly that base rate: the survey's own strongest-looking claims survived checking one time in four.

---

## 1. Executive answer

### What the verification pass killed

**Killed: "every style embedding scores below chance on the content-independence test."** `[VERIFIED FALSE]` The narrow true version: on the five-feature STEL-or-Content benchmark, all six representations in StyleDistance Table 3 average below the 0.50 baseline (LUAR 0.03, LISA 0.03, Wegmann 0.22, StyleDistance 0.29, StyleDistanceSynth 0.31). But on the Formal dimension three of the six score *above* chance (0.70, 0.72, 0.73). The people who invented the test wrote that it should only be read alongside other evaluations, because a model can score well simply by penalizing lexical overlap. Nothing here is a proof of what style vectors "miss." Do not build an argument on "provably."

**Killed: "topic control is the single design choice that decides whether an embedding encodes style."** `[VERIFIED FALSE]` The source names two co-equal factors, and content control has *zero* measured effect on the direct style-representation benchmark (all six fine-tuned models flat at 0.71 to 0.73, all below untuned roberta-base at 0.80). The headline 18-point gap compares two different test sets; the within-test-set gap is 9 points. The best model in the paper still scores 0.42, below chance.

**Killed: "LUAR collapses by two thirds cross-domain, so it is unsafe as a judge."** `[VERIFIED FALSE]` The collapse belongs to the Amazon-trained and fanfiction-trained checkpoints nobody deploys. The released Reddit-trained checkpoint everybody uses retains over 80% of in-domain retrieval zero-shot, and actually scores *higher* on Amazon (68.91) than on Reddit (65.61). The paper attributes Reddit's advantage to topic diversity **and** dataset size; the claim denied the size half. Also, the downstream argument does not connect: TinyStyler and StyleMC both use LUAR in-domain on Reddit, which is its best operating point.

**Held: TinyStyler.** `[VERIFIED]` An 800M model conditioned on an authorship embedding beats GPT-4 on authorship style transfer (Joint 0.40/0.45/0.36 vs 0.33/0.31/0.30), and the movement *toward* the target author is at the floor for every system tested: 0.11 to 0.15 for TinyStyler, 0.07 to 0.09 for GPT-4, against a 1.0 ceiling demonstrated by an oracle. The highest Towards score by any non-oracle system in the whole table is 0.16. Caveat the verifier added: the comparison is not compute-matched, and the human evaluation gap on formality is wider than the automatic one (0.71 vs 0.91).

### What the literature actually establishes

1. **Preference personalization works. Voice does not.** `[PEER-REVIEWED, cross-cutting]` This is the strongest signal in the entire body of work and no single paper states it. Per-user LoRA (OPPU) moves classification accuracy 0.756 to 0.797 and MAE 0.223 to 0.143, then moves headline generation ROUGE-1 by **+0.001** and tweet paraphrase by **+0.004**. Agentic persona memory (PersonaAgent) posts large preference gains and reports no style metric at all. Retrieval by style embedding beats BM25 on LaMP by 0.003 ROUGE-1. Calibrated authorship scoring across four prompting methods spans 0.484 to 0.508. Full parametric per-user training, the most expensive intervention available, is at ROUGE noise on generation. The failure is not a measurement artifact across one method family. It reproduces across prompting, retrieval, embedding conditioning, agent memory, and fine-tuning.

2. **Detection is the bottleneck in any detect-then-fix design.** `[PEER-REVIEWED]` GPT-4 locates the first logical error 52.87% of the time, and corrects reliably once told where it is (gains of +18 to +44 on previously-wrong traces against losses of 0 to 11 on previously-right ones). If your detector is near coin-flip, a competent rewriter receives garbage targets.

3. **Serializing phases into separate calls beats packing them into one prompt, on one task.** `[PEER-REVIEWED]` Chaining beat stepwise on summarization with both automatic and human evaluation across three models. The mechanism matters: stepwise produced *better* critiques (MetaCritique F1 52.48 vs 24.79) and *worse* final output, because the model anticipates its own critique stage and emits a deliberately weak draft. Measured on summarization only, InstruSum, 100 items. Never replicated on style or tone editing.

4. **Self-correction without external signal is flat or harmful.** `[PEER-REVIEWED]` Every intrinsic self-correction cell in the ICLR 2024 study is flat or worse (GPT-4 GSM8K 95.5 to 91.5 to 89.0). The TACL survey concludes no prior work demonstrates successful intrinsic self-correction outside tasks exceptionally suited to it, and names the bottleneck as feedback generation. It also names the four conditions where self-correction genuinely works, and one of them is directly relevant: **tasks decomposable into individually checkable sub-parts.**

5. **Iterating the same rewrite buys almost nothing.** `[PREPRINT + PEER-REVIEWED]` Single-shot rewriting matched a 10-iteration loop within 0.2 points on the one task where it was budgeted. Self-Refine's own iteration curve flattens after the first pass. Add stages with *different jobs*, not more of the same stage.

6. **Content-similar exemplar retrieval actively degrades style fidelity.** `[PEER-REVIEWED]` Selecting writing samples by topic similarity, which is what a naive RAG system does, drops authorship attribution 20 to 33 points (Enron 69.33 to 36.00, Reddit 35.43 to 16.63, Blog 43.93 to 22.13). The authors' explanation is loss of stylistic diversity across the sample set.

7. **Register decides difficulty, in both directions.** `[PEER-REVIEWED, corroborated across two disconnected literatures]` Structured registers are imitable and hard to erase; informal personal writing is the reverse. Imitation: news 96.4 AV, email 95.4, Reddit 68.1, blogs 19.4. Obfuscation: blogs erase easily (56.4 drop), scholarly prose barely at all (11.5). Two fields measured the same latent variable on opposite tasks and neither cites the other.

8. **The identity signal is durable even under attack.** `[PEER-REVIEWED]` After the best published deliberate attempt to strip a person's identity from their own writing, roughly 76% to 81% of the authorship-model-measured signal survives. Your failure to reproduce voice is a capability failure, not a signal-availability failure.

9. **The generating model's fingerprint survives everything tried so far.** `[PREPRINT]` Within-model authorship similarity 0.918 (Qwen to Qwen) against generated-to-real 0.45 to 0.49. A controlled human post-editing study (n=81) found post-edited text moved toward the writer's own style (g=0.55) yet remained significantly closer to LLM text than to that same person's unassisted writing (g=-1.43), and more homogeneous across people (g=1.42).

### What is folklore

**Temperature schedules.** `[CONVENTION]` The descending per-stage gradient is real and recurring in published pipelines (1.0 to 0.1 to 0.05 to 0.0; 0.1/0.2/0.3/0.7), and in every instance checked it is justified as "design intent" or "standard practice" with **no ablation against a uniform setting**. The nearest actual measurements are mildly hostile: temperature 0.0 to 1.0 had no significant effect on task performance across nine models and five prompting techniques, and the one reliably measured consequence of raising temperature is worse coherence (novelty beta 0.308, coherence 0.240 toward more incoherence, cohesion and typicality unaffected). A 0.7 to 0.45 to 0.3 schedule has zero measurement behind it. **Nobody has run this experiment.**

**"LLMs memorize n-grams from exemplars instead of learning style."** `[UNMEASURED]` This is the stated motivation of the strongest retrieval-side paper in the set, and it is cited there to an unrelated quantization study. No paper reports copy rate against a style-fidelity score. The closest real numbers are indirect.

**"More writing samples means better voice."** `[PEER-REVIEWED, contradicted]` Four papers give four answers: 4 hand-picked exemplars competitive with 100; 2 to 10 changes four metrics very little; style similarity still rising from 5 to 30; 16 to 64 improves formality. Different tasks, different metrics, no common scale. Nobody has run the sweep with one calibrated metric.

### The unresolved contradiction at the center

Two preprints, neither verified, make opposite claims about whether this problem is solved:

- **StyleMC** reports 0.849 author-style fidelity against a 0.852 human reference, beating GPT-4 at p < 1e-7.
- **Sawant** reports that no inference-time method reaches even the cross-author human floor (four methods spanning 0.484 to 0.508 against a floor of 0.626 and a ceiling of 0.756).

The likeliest reconciliation, stated as inference and not as a finding: StyleMC generates 32-token spans, in-domain on Reddit, judged by a sibling checkpoint of the exact representation it optimizes against (control = LUAR trained on 1M Reddit users; judge = UAR trained on 5M Reddit users, same paper, same recipe). That is the same circularity the survey correctly used to discount LLM-judge profile extraction, and it was never applied here. Sawant runs out-of-domain on full blog posts with a judge validated independently on that corpus (single-post AUC 0.76, 5-post 0.96, TF-IDF baseline 0.54). Long-form professional prose with no author-specific control signal sits at the Sawant end of that spread, not the StyleMC end.

**Every fidelity number in this literature is short-form and nobody says so.** StyleMC caps at 32 tokens. TinyStyler and TextSETTR are sentence-level. LaMP's three generation tasks have average outputs of 11.1, 10.3, and 18.0 tokens. The one long-form personalization benchmark (LongLaMP, 92.6 to 304.5 tokens) fixed the length problem and reproduced the metric problem exactly: ROUGE, METEOR, no authorship or stylometric metric, no human evaluation.

---

## 2. Per-pillar synthesis

### Pillar A: authorship representation

| Claim | Strength |
|---|---|
| Embedding conditioning beats GPT-4 on style transfer, but absolute movement toward the target author is near the floor for every system tested | `[VERIFIED]` |
| Content-independence scores sit below the 0.50 baseline for all six representations tested on the five-feature benchmark, with per-feature exceptions on formality | `[VERIFIED, corrected from the original overreach]` |
| Content control plus the contrastive setup reduces topic reliance and improves content-independence, while leaving direct style representation unchanged | `[VERIFIED, corrected]` |
| Reddit-trained LUAR transfers well (over 80% of in-domain retrieval, zero-shot); other training domains do not | `[VERIFIED, corrected]` |
| Adding more few-shot samples barely changes fidelity; selecting them by content similarity degrades it 20 to 33 points | `[PEER-REVIEWED]` |
| Directional restyling beats overwriting: discarding the source style vector for the target profile drops transfer accuracy 54.0% to 25.3% | `[PEER-REVIEWED]` |
| Named surface habits in words plus dissimilar-author contrastive samples give the largest retrieval-side gain (ROUGE-1 0.437 to 0.501); numeric features are neutral or harmful; more than 3 contrastive authors hurts | `[PEER-REVIEWED, ROUGE on 11 to 18 token outputs]` |
| Per-user LoRA moves classification a lot and generation by 0.001 to 0.010 ROUGE-1; the word "style" appears once in that paper, in a bibliography entry | `[PEER-REVIEWED]` |
| Obfuscation leaves 76 to 81% of the identity signal intact; per-author control needs only a 7-scalar vector once class-level adapters exist | `[PEER-REVIEWED]` |
| Mean pooling costs a four-fold retrieval drop against the identical encoder scored token by token | `[PREPRINT]` |
| No inference-time method clears the cross-author human floor; LLM-judge trait matching is circular; trait extraction is unstable (Jaccard 0.22 across runs) | `[PREPRINT, unverified, load-bearing]` |
| Embedding-guided decoding nearly closes the gap to human reference | `[PREPRINT, unverified, load-bearing, and circular by the survey's own standard]` |
| Activation steering works for coarse labeled classes; it has never been demonstrated for one individual | `[PEER-REVIEWED for the method, UNMEASURED for individuals]` |

### Pillar B: pipeline decomposition

Nothing in this pillar was adversarially verified. Discount accordingly.

| Claim | Strength |
|---|---|
| Separate calls beat one packed prompt for draft/critique/refine, on summarization | `[PEER-REVIEWED, one task, one dataset, 100 items]` |
| Single-prompt decomposition produces "simulated refinement": impressive critiques, worse endpoints | `[PEER-REVIEWED, qualitative, never quantified]` |
| Human-in-the-loop chaining preferred 80 to 85% by blinded raters over a single-prompt sandbox | `[PEER-REVIEWED, N=20, 2021-era model]` |
| Self-Refine gains are concentrated in preference tasks (+49.2 dialogue, +32.4 sentiment) and absent on anything checkable (+0.2 math) | `[PEER-REVIEWED]` |
| Intrinsic self-correction is flat or harmful on reasoning, and compounds with rounds | `[PEER-REVIEWED]` |
| Self-correction works only under four named conditions, one of which is sub-part-checkable tasks | `[PEER-REVIEWED]` |
| Detection is the failure point; correction is competent given a location | `[PEER-REVIEWED]` |
| Fresh-context review in a separate session beats same-session self-review (F1 28.6 vs 24.6, p=0.008); a same-session subagent is not equivalent (23.8); running self-review twice is worse than once (21.7); every condition is under 30% F1 | `[PREPRINT, N=30, one model]` |
| The self-review failure is partly role labeling, not reasoning: relabeling the model's own wrong claim as external lifts correction 23 to 93 points | `[PREPRINT]` |
| 64.5% average blind-spot rate on own-output errors across 14 models; appending "Wait" cuts it 89.3% | `[PREPRINT]` |
| A single informed rewrite matches a 10-iteration loop within 0.2 points | `[PREPRINT]` |
| Temperature 0.0 to 1.0 has no significant effect on task performance | `[PEER-REVIEWED, multiple choice, correctness not style]` |
| Higher temperature's one reliable effect is worse coherence | `[PEER-REVIEWED]` |
| Descending per-stage temperature gradients | `[CONVENTION, never ablated]` |
| Stage-wise temperature schedules evaluated against uniform | `[UNMEASURED, does not exist]` |

---

## 3. Recommended reference architecture

Stages are ordered by what they consume, not by how impressive they sound. Every stage that cannot be measured should be deleted.

**Stage 0, offline: corpus, habits, and a metric you validated yourself.**
Hold out part of the author's real writing. Fit or select an authorship-verification scorer and prove it separates this author from a pool of other writers **on held-out human text at your real output length**. Report the AUC. Compute two numbers on your own corpus: the same-author human ceiling and the cross-author floor. Those two numbers are the only scale on which any later change is legible. Extract named surface habits (most frequent words, dependency patterns, sentence-length and punctuation distributions). Words go in the prompt; numbers go in the scanners only. Pick 1 to 3 maximally dissimilar writers as contrastive samples.

**Stage 1, detect.** Rule-based scanners first, producing spans and labels, not prose advice. An LLM detector is optional and should be measured before it is trusted; the published figure for the analogous task is 52.87%. Detect two different things and keep them separate: AI tells (what you scan for today) and deviation from this author's habits (which you do not detect at all today).

**Stage 2, rewrite.** One call, low fixed temperature. Inputs: source text, detected spans, named habits, 3 recent published samples, contrastive samples, the structural recipe. Frame the instruction directionally: move away from these specific detected spans toward these specific habits, leave everything else. Do not frame it as "apply this target profile."

**Stage 3, mechanical scrub.** Unchanged. Regex and fixed rules are the only exact component in the whole system.

**Stage 4, fresh-context check.** A genuinely separate session, run **once**, with the rewritten text presented as user-supplied material rather than as the assistant's own prior turn. Output is pass/fail plus spans, never a rewrite. On fail, one targeted repair call scoped to the flagged spans. Never a second full rewrite.

**Stage 5, score and log.** Extend the existing JSONL row with: recipe drawn, detected spans, audit verdict, authorship score, and distance to the ceiling and floor from Stage 0. Read the ledger weekly and ask one question: is the authorship score moving.

---

## 4. Ranked changes to the existing build

### Leave these alone. They are already right.

- **No temperature staging.** The absence is correct. The schedule you did not build has no measurement behind it, and the closest evidence says temperature does not matter in that range and that raising it degrades coherence. Do not add it. This is the single cheapest correct decision in the current build.
- **The JSONL ledger of original/rewritten pairs.** This is the substrate every improvement below depends on. It is already there.
- **Mechanical regex scrub and the two fixed-rule scanners.** Exact rules beat both published alternatives: the LLM error-locator at 52.87% and the fresh-context audit at under 30% F1. Keep and extend them; do not replace them with a model.
- **Recency-based voice sample selection, and three of them.** Recency is defensible and the obvious "upgrade" is measurably harmful. Three samples sits inside the flat region of every published exemplar sweep.
- **One rewrite pass, not an iteration loop.** Two independent results say stacking more rewrite passes buys nothing once the first informed pass has run.

### Ranked changes

| # | Change | Evidence | Expected payoff | Cost |
|---|---|---|---|---|
| 1 | **Build the evaluation before anything else.** Validated authorship scorer on your own corpus, ceiling and floor computed on your own text, scored at your real output length, appended to the ledger. | `[PREPRINT]` for the calibration method; `[VERIFIED]` that unvalidated metrics mislead; `[PEER-REVIEWED]` that ROUGE is not voice | Transformational. Without it, every other item on this list is a guess, and the field's own record is that unmeasured changes produce 0.001-level movement. | 1 to 3 days. Zero runtime cost. |
| 2 | **Make the scanners drive the rewrite instead of only checking it afterward.** Pass detected spans into the rewrite prompt as targets. | `[PEER-REVIEWED]` detection is the bottleneck and correction is competent given a location; `[PEER-REVIEWED]` self-correction works on sub-part-checkable tasks | Moderate to high, and it is the change most consistent with what the literature actually supports. You already own the hard part (an exact detector). | Low. One prompt change, no new call. |
| 3 | **Add named surface habits (words, not numbers) plus 1 to 3 contrastive samples from maximally dissimilar writers.** | `[PEER-REVIEWED]` 15% relative ROUGE-1 gain, dependency patterns alone over 10% ROUGE-L; numeric features neutral or harmful; beyond 3 contrastive authors hurts | Plausible and cheap. Caveat honestly: measured by ROUGE on 11 to 18 token outputs, never at your length. | Low. One-time extraction plus prompt tokens. |
| 4 | **Reframe the rewrite as directional rather than as profile application.** "Move away from these detected spans toward these habits" rather than "write in this voice using this structure." | `[PEER-REVIEWED]` the overwrite ablation (54.0% to 25.3%). Analogy caveat: that result is a latent-vector operation, not a prompt, so this is suggestive, not evidence. | Unknown magnitude, low downside. Test it as an A/B against your Stage 0 metric. | Low. |
| 5 | **Split the single pass into two calls (surface, structural).** | `[PEER-REVIEWED]` chaining beats stepwise, with the failure mode named. Analogy caveat: your build packs two rule documents into one prompt, which is not exactly stepwise draft/critique/refine. Never replicated on style editing. | Uncertain. Run it as a measured A/B, not as a default. If the second call has no distinct job, it is ceremony. | 2x tokens and latency on the rewrite stage. |
| 6 | **Add a fresh-context check, once, in a separate session, with the text presented as user-supplied.** | `[PREPRINT]` CCR 28.6 vs 24.6 F1, subagent not equivalent, twice is worse than once; `[PREPRINT]` role relabeling lifts correction 23 to 93 points | Small and bounded. Every published condition catches under 30% of injected defects. Do not expect it to save a bad rewrite. Carries a real credulity risk: the same framing that makes the audit effective made injected false claims succeed 70% of the time under trust framing. | One extra call plus session plumbing. |
| 7 | **Do not switch voice-sample selection to similarity retrieval.** If you want to improve selection, try maximizing stylistic diversity across the three samples. | `[PEER-REVIEWED]` for the harm of similarity selection; `[UNMEASURED]` for diversity-maximizing selection | Prevents a likely regression. The diversity variant is a hypothesis, not a finding; A/B it. | Zero to prevent. Low to test. |
| 8 | **Keep the randomized structural recipe, but stop treating it as voice control.** Its defensible job is fighting cross-piece sameness, which is a documented failure (post-edited text was more homogeneous across writers than unassisted writing, g=1.42). Its mechanism is unmeasured, and the ban-last-3 ledger has no evidence for or against it. | `[PREPRINT]` for the homogeneity problem; `[UNMEASURED]` for the recipe mechanism | Neutral now. Once item 1 exists, this becomes the first thing worth ablating: recipe on vs off vs input-conditioned. | Zero. |
| 9 | **Stop importing effect sizes from the literature into your expectations.** Every fidelity number cited above was measured on 10 to 32 token outputs. | `[PEER-REVIEWED]` output lengths of 11.1, 10.3, 18.0 tokens; StyleMC at 32 | Prevents overpromising. | Zero. |
| 10 | **Accept that the generator's own fingerprint may be the ceiling and measure the gap rather than adding passes to fight it.** | `[PREPRINT]` within-model similarity 0.918 vs generated-to-real 0.45 to 0.49; human post-editing stayed closer to LLM text than to the person's own writing | Sets an honest target. If your Stage 0 gap does not close, no additional pass in this architecture will close it, and the next real lever is per-user parametric adaptation or embedding-guided decoding, neither of which has been placed on a calibrated scale. | Zero to measure. Large to act on. |

---

## 5. Unvalidated, and nobody knows

Stated as flatly as the evidence allows.

1. **Stage-wise temperature schedules have never been evaluated.** No study holds a pipeline fixed and varies the schedule (descending vs uniform vs ascending) while measuring output quality. The recurring gradient in published pipelines is design intent, restated, never tested. Nobody has measured this.
2. **No study isolates the marginal contribution of each stage in a detect / rewrite / scrub / audit pipeline.** Chaining-vs-stepwise tests three stages as a block. Cross-context review tests only the audit stage. Nobody has run the ablation that says which passes are load-bearing.
3. **Chaining-beats-stepwise has been shown on summarization only,** one dataset, 100 items. Never on style, tone, voice, or humanization.
4. **Exemplar parroting is not measured anywhere.** No paper plots n-gram or longest-common-substring overlap between a generation and the specific samples in its prompt alongside a style-fidelity score. The claim that models copy exemplar phrasing is asserted and cited to an unrelated paper.
5. **"Simulated refinement" is documented qualitatively and never quantified.** How much draft quality degrades when the model knows a critique stage is coming is unmeasured, and it determines whether stages should be blind to each other.
6. **Whether context isolation or role relabeling is the operative mechanism in fresh-context review is untested.** The two explanations make different engineering predictions, and the cheaper one (relabel the text as user content in a fresh call) has never been compared against the expensive one (a genuinely separate session).
7. **How much of a person's writing you need is unresolved,** and the four published answers contradict each other because they use different tasks and metrics. Nobody has run the sweep on one calibrated metric.
8. **No authorship-identity metric has been reported along an interpolation path.** Both papers that validate latent traversal use surface proxies (formality classifier accuracy, capital-character rate, punctuation rate). Whether a midpoint between two author vectors decodes as a coherent third author or as incoherent blend is unknown.
9. **No method, prompted or embedding-conditioned, has been placed on the same calibrated scale.** Only four inference-time prompting methods have ever been scored against a computed human ceiling and floor. Embedding conditioning, guided decoding, per-user fine-tuning, and alignment objectives have never been.
10. **Activation steering for one individual is untested.** Every published style vector is a class-mean difference built from hundreds to hundreds of thousands of labeled exemplars. The parameter-space workaround exists in the obfuscation literature; the activation-space version for one person does not.
11. **There is no evidence about professional long-form business writing.** Training and evaluation corpora are Reddit, Amazon reviews, fanfiction, blogs, Enron email, and news wire. Register is the largest measured effect in the whole area (AV 96.4 vs 19.4 across corpora), which means importing any of these numbers to your register is unsupported.
12. **Dense embedding conditioning and exemplar retrieval have never been ablated head to head or combined under one metric.** Whether the two signals are complementary or redundant is open.
13. **Every conditioning method surveyed consumes a single mean-pooled vector,** which is the exact aggregation shown to cost a four-fold retrieval drop for authorship. Whether conditioning on a token-level author representation improves generated style fidelity is entirely untested.
14. **How to remove the generating model's own fingerprint is unknown.** No intervention has been shown to close it, including human post-editing under controlled conditions.
15. **Which stylistic dimensions a dense embedding carries and which it drops has not been decomposed in a form a system can act on.** The one interpretable inventory (768 named attributes) scores 0.03 on content-independence, so its axes cannot be trusted as a diagnosis.

---

# Appendix A: completeness critique

## What is missing

**1. There is only one pillar.** The artifact declares `"pillar": "authorship-representation"` but ships nothing else. Your own question asks about "a contradiction between pillars" and that question is unanswerable against this document. Anything a real voice pipeline needs beyond representation (data collection and consent, retrieval infrastructure, serving cost, drift over time, per-user isolation, output review) is not merely under-covered, it is structurally absent.

**2. The verification is 29% complete and the survival rate is terrible.** There are 14 findings and 4 verdicts. Of the 4 verified, 3 were overturned (StyleDistance "every embedding below chance", Wegmann "single design choice", LUAR "collapses by two thirds"). That is a 25% survival rate on a sample the survey presumably chose as its strongest. The 10 unverified findings inherit that base rate and must be treated as unreliable. Worse, the two unverified claims carrying the entire narrative are both non-peer-reviewed preprints:

- **StyleMC (arXiv 2312.17242)**, the "strongest reported author-style fidelity" claim, 0.849 against a 0.852 human reference.
- **Sawant (arXiv 2604.26460)**, the "no method reaches the cross-author human floor" claim, and the only calibration anywhere in the document.

These two make opposite claims about whether the problem is solved. Nobody checked either.

**3. The circularity lens is applied asymmetrically.** Finding 5 correctly kills Profile Extraction for being scored by an LLM judge that does the same operation as the method. That exact critique lands harder on StyleMC and is never made: StyleMC's control signal is LUAR trained on 1M Reddit users, its judge is UAR trained on 5M Reddit users (a sibling checkpoint from the same paper and recipe), and its evaluation is on in-domain Reddit. A system that optimizes a token-level rescorer against the family of representation that will grade it is not "closing the distance to human," it is hill-climbing its own metric. The survey's own verdict 4 establishes that both control and judge trace to Rivera-Soto et al. 2021 and then does not draw the conclusion.

**4. Every fidelity number in the survey is short-form, and the survey never says so.** StyleMC caps generations at 32 tokens. TinyStyler and TextSETTR are sentence-level. LaMP's three generation tasks have average output lengths of 11.1, 10.3, and 18.0 tokens (verified below). A voice-replication pipeline writes emails and documents. There is no length axis anywhere in the findings, the gaps, or the verdicts.

**5. Four research areas were never searched at all:**
- Per-user fine-tuning and parameter-efficient adaptation. The gap list says fine-tuning "has never been placed on the same calibrated scale" while the survey never looked at the fine-tuning literature.
- Authorship obfuscation, the adversarial mirror of this task, which routinely reports authorship-identity metrics as the primary number, the discipline the survey says personalization lacks.
- Human evaluation asking whether readers who know the author can tell. TinyStyler's human eval is mentioned only inside a verdict. Nobody asks the product question.
- Deployed and open-source systems. The brief named GitHub. Zero repos, zero cost figures, zero latency figures, zero engineering baselines appear.

**6. Questions the survey does not answer.** Given N documents from one professional writer, what do you build, how much text do you need, what does it cost per user, and how do you validate your metric on your own corpus? None of this is addressed. The one prescriptive finding (Yazan et al., named surface habits plus dissimilar-author negatives) is ROUGE-scored on headlines and tweets.

---

## Missing piece 1: the entire per-user fine-tuning arm, and it fails exactly where the survey does not look

**OPPU (One PEFT Per User), Tan, Zeng, Tian, Liu, Yin, Jiang. EMNLP 2024 main, pages 6476-6491.** `https://aclanthology.org/2024.emnlp-main.372/`
Evidence: **peer-reviewed**. I downloaded the PDF and extracted the text with pypdf rather than trusting a summarizer. Text at `C:\Users\snahrup\AppData\Local\Temp\claude\C--Users-snahrup-OneDrive---IP-Corporation-ipcorp-architecture-brain\c865fdd5-9370-40c9-b91e-7fd60e154a1d\scratchpad\oppu.txt`

A private LoRA module per user, trained on that user's full behavior history, Llama-2-7B base, 100 most-active users per LaMP task, BM25 retrieval, combinable with retrieval and profile augmentation. This is the third arm the survey's implicit hierarchy (prompting, then retrieval, then embedding conditioning) leaves out.

Table 1, verified cell by cell. On the four classification and preference tasks the gains are large: LaMP-1 accuracy .756 to .797, LaMP-2M .622 to .648, LaMP-3 MAE .223 to .143. On the three generation tasks, measured against the best non-OPPU cell in the same row:

| Task | best baseline R-1 | best OPPU R-1 | delta |
|---|---|---|---|
| LaMP-4 headline | .198 (RAG k=4) | .199 | **+0.001** |
| LaMP-5 title | .516 (PAG k=1) | .526 | +0.010 |
| LaMP-7 tweet | .577 (RAG k=2) | .581 | **+0.004** |

The two best LaMP-4 R-1 cells (.196, .199) carry no significance marker at all. The abstract's headline numbers (17.38% MAE, 11.87% accuracy) are both classification. The paper quotes a generation gain only for LaMP-5 and stays silent on LaMP-4 and LaMP-7.

Two further verified facts. Table 2 gives average output lengths for the generation tasks: **11.1, 10.3, and 18.0 tokens**. The word "style" appears exactly once in the paper, in a bibliography entry ("ELECTRA-style pre-training"). There is no stylometric, style-embedding, or authorship metric, and no human evaluation. Cost, verbatim: "Training 100 personal PEFT sequentially took around 12 minutes to 12 hours depending on the size of the behavior history corpus and the sequence length per history item" on 3 A6000s (the phrasing is ambiguous between per-user and per-100 and I am not resolving it).

**Why this matters more than any single finding in the survey:** there is now a cross-cutting regularity nobody states. OPPU, PersonaAgent, LaMP retrieval, and RAGs to Style all post real gains on classification and preference, and all stall at ROUGE noise on generation. Full parametric per-user training, the most expensive intervention available, moves headline generation by one thousandth of a ROUGE point. That converges with Sawant's flat 0.484 to 0.508 spread. The survey treats "personalization works but is measured wrong" as its story. The stronger reading is that preference alignment works and voice does not, across every method family including the one it never searched.

## Missing piece 2: the obfuscation field already built the mechanism the survey calls an open question

**StyleRemix, Fisher, Hallinan, Lu, Gordon, Harchaoui, Choi. EMNLP 2024 main, pages 4172-4206.** `https://aclanthology.org/2024.emnlp-main.241/`
Evidence: **peer-reviewed**. PDF extracted with pypdf. Text at `...\scratchpad\styleremix.txt`

Seven style axes, 16 directions, one LoRA adapter per direction on Llama-3-8B, trained on DiSC (500 base paragraphs from Wikipedia, books, and blogs, rewritten by GPT-4 Turbo along each axis). Per author, an author vector in R^7 is computed from automatic scoring of the seven axes, normalized across authors, differenced against the group mean; the top-k deviating axes are selected and adapter weights are set by standard deviations from the mean, mapped to {0.7, 0.9, 1.2, 1.5} inside the workable LoRA range [-1.5, 1.5]. Adapters are composed sequentially, by merging, or via LoraHub+. Merging four adapters takes under 5 seconds.

This directly contradicts three of the survey's stated gaps:

- *"Activation steering has never been demonstrated for an individual author... whether a usable steering direction can be extracted from the 10 to 100 documents one person has written is untested."* StyleRemix separates the two costs: the axis adapters are class-level and reused across all authors, while the per-author part needs only enough text to estimate seven scalars. It is parameter space rather than activation space, but the stated obstacle (hundreds of labeled exemplars per individual) is engineered away.
- *"Nobody has decomposed which stylistic dimensions a dense embedding carries and which it drops, in a form a system could act on."* DiSC is that decomposition, with validation (Table 1: length 18.87 to 23.04 up / 18.24 down, function words 40.08 to 55.19 / 21.47, grade level 9.45 to 11.08 / 6.72, formality 0.68 to 0.97 / 0.43; human accuracy on sarcasm 97.7, voice 93.7, writing intent 77.7 across 4 classes). Note the "shorter" direction barely moves, 18.87 to 18.24, which the paper does not remark on.
- *"No authorship-identity metric has been reported along an interpolation path."* Table 4 sweeps adapter count 1 through 7 with an identity-based score in every cell (Speeches 17.0/17.7/21.2/19.2/6.0/17.0/11.4; Blog 13.1/16.5/19.6/18.9/12.1/10.5/6.4). Deviation-based axis selection beats random selection by about 6%. Five or more adapters costs roughly 16% grammar.

**The finding that should change how you read the whole survey.** StyleRemix reports drop rate two ways: against per-domain RoBERTa-large attribution classifiers (94.0% average accuracy) in Table 2, and against a LUAR-family authorship representation in Appendix F Table 13. They disagree by two to three times, always in the same direction.

| Domain | best RoBERTa drop | best LUAR drop |
|---|---|---|
| Speech | 41.2 | 23.9 |
| Novels | 35.6 | 31.7 |
| Scholar | 11.5 | 13.0 |
| Blog | 56.4 (JAMDEC) | 19.4 (JAMDEC) |

Read against the direction of interest: after the best published deliberate attempt to erase a person's identity from their own text, roughly **76% to 81% of the LUAR-measured identity signal survives**. The paper calls this "excellent anonymization capabilities." For a replication pipeline the same number says the identity signal is far more durable than the imitation results suggest, which makes the failure to reproduce it a capability failure, not a signal-availability failure.

Second, the domain ordering corroborates the survey's finding 6 across an independent literature that never cites it. Wang et al. found news and email easy to imitate (CCAT50 AV 96.4, Enron 95.4) and blogs hard (19.4). StyleRemix finds blogs easy to erase (drop 56.4) and scholarly prose nearly impossible (11.5, overall score 3.5 for every method tested). Same latent variable, opposite tasks, mutually confirming: corpus identifiability predicts both imitability and erasure resistance. Neither field appears to know the other measured it.

## Third item, named because it closes the length gap the survey never opened

**LongLaMP (arXiv 2407.11016).** Evidence: **empirical-nonpeer**, and weaker than the two above because I read the fetched HTML through a summarizer rather than extracting the PDF myself; venue not verified. Output lengths 92.6 to 304.5 tokens across email completion, abstract generation, review writing, and topic writing, with profiles of 34 to 120 entries per user. The long-form personalization benchmark the survey needs already exists. It scores with ROUGE-1, ROUGE-L, and METEOR, has no authorship, style-embedding, or stylometric metric, and no human evaluation. So the successor benchmark fixed the length problem and reproduced the metric problem exactly, which sharpens rather than resolves the survey's critique of LaMP.

## Sources

- [OPPU, EMNLP 2024](https://aclanthology.org/2024.emnlp-main.372/) / [arXiv 2402.04401](https://arxiv.org/abs/2402.04401) / [code](https://github.com/TamSiuhin/OPPU)
- [StyleRemix, EMNLP 2024](https://aclanthology.org/2024.emnlp-main.241/) / [arXiv 2408.15666](https://arxiv.org/abs/2408.15666) / [code](https://github.com/jfisher52/StyleRemix)
- [LongLaMP, arXiv 2407.11016](https://arxiv.org/abs/2407.11016)