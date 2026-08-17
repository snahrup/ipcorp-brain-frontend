# PM Walkthrough Inspiration, research compendium (2026-08-17)

Context: the dashboard-overload brainstorm. The direction under consideration replaces the Today
landing page with a generated "PM standup walkthrough": a short ranked brief (capped ~5 items) in
PM kinds (work on this / decide this / give a ballpark / chase this reply), each with an inline
reply routed back into Jira, email drafts, or the brain. Four research scans looked for prior art:
open-source standup tooling, commercial products that act like a PM, ritual and triage UX
mechanics, and LLM morning-brief builds. Every repo and page cited below was fetched and verified
at research time.

## Headline finding

Nobody has shipped the combined loop. No product mixes the four PM kinds in one brief. Asking for
a ballpark estimate as a first-class question is essentially absent outside planning poker and
Sunsama's self-estimates. The reply-routes-back loop exists only in fragments. The pieces all
exist and work separately; combining them is open ground.

## The rules that repeated across all four scans

1. **Machine drafts, human amends.** The system writes the first pass from real activity (git,
   Jira, calendar, Slack); the human confirms or corrects, never authors from blank. (Range,
   Spinach, AsyncStatus, Height, git-standup.)
2. **One item at a time, tiny closed verb set, terminal states.** Every item reaches exactly one
   disposition from a set of about four. Linear Triage: accept / duplicate / decline / snooze on
   number keys. Superhuman: today / later / done. Scout: do it / skip / modify. Card-at-a-time
   presentation (Triage.cc) is what makes a queue feel calm.
3. **A hard cap is trustworthy only when the remainder is visibly parked.** OpenJarvis delivers
   exactly five bullets. Things 3 splits Today from Anytime. Gmail Priority Inbox keeps
   "Everything Else" below the fold rather than hidden. The cap must never read as concealment.
4. **Snooze carries a return trigger.** Linear snooze returns at a chosen time OR on new activity,
   whichever comes first. Taskwarrior review stamps a reviewed timestamp on the item so answered
   items stay quiet for a week, and progress-on-the-item makes the session resumable for free.
5. **Ballparks collect as forced-choice chips, not free text.** The entire interaction thesis of
   planning poker (Thunderdome). A row of tappable preset values beats an empty input.
6. **Replies land in the source system as drafts and comments, never sends.** Harper Reed moved to
   draft-only after an agent sent mail without approval. ScrumAgent writes chat-thread replies
   back into the tracker. Matches the house rules here already.
7. **Repetition is the least-solved public problem.** The fixes that exist are all ledgers: close
   out yesterday before writing today (Ortiz), thumbs-down writes to a memory file (OpenJarvis),
   a corrections file steers future briefs (COS /learn), reviewed timestamps (Taskwarrior). A
   brief that keeps its own record of what it said and what got acted on beats everything public.
8. **Rank from declared priorities plus simple mechanical signals.** goals.yaml as the source of
   truth (claude-chief-of-staff), explicit deadline, leadership sender, direct mention, and
   "appears in multiple channels" as a promotion signal (RheingoldAI). Linear Pulse personalizes
   from the explicit membership graph before any inference. Nobody credible machine-learns this.
9. **Designed start, designed end.** One start button, an advertised cost ("stay informed in 5
   minutes"), and an empty state with meaning. Bond opens with "you're all caught up. I handled
   most of the noise, here's what's left." The Duolingo teardown warns that a flow without an
   explicit exit feels like an infinite list. Sunsama's workload check (summed estimates vs
   stated capacity, overflow visible, one-key deferral) is the in-flow honesty mechanic.
10. **The system owns the nagging and the pushback.** Standup Raven nudges at 80% of the window
    and names non-responders. Comedian tags people about deadlines. standup-for-one questions
    vague answers and says "deferred 3 standups running" out loud. Dead Viva Briefing mined your
    own sent mail for commitments you owe and replies you are owed, and its death is a warning:
    a briefing without inline action dies.
11. **Trust tags per item.** Scout labels every item by corroboration: verified (2+ sources),
    single-source, unverified, stale, contradicted. Maps directly onto the Workbench fail-closed
    evidence rules and the per-source observations TodayView already records.

## Scan 1: open-source standup tooling (GitHub, all fetched)

1. **Scout** (https://github.com/Raven-Scout/scout-plugin, 9 stars, 327 commits, MIT, active).
   Claude Code agent reading Slack, Gmail, Calendar, Linear, GitHub, Granola, Drive overnight;
   cross-checks findings across sources; each morning produces a short list of what actually
   needs you, each item tagged verified / single-source / unverified / stale / contradicted.
   `/scout-work` then walks today's items one at a time with a recommended action; the user
   answers "do it", "skip", or a modification before anything executes. The closest existing
   thing to the walkthrough concept.
2. **tasksh review / Taskwarrior** (https://github.com/GothenburgBitFactory/taskshell, flow at
   https://taskwarrior.org/docs/review/). Interactive one-at-a-time review; `review 12` caps the
   batch; marking reviewed stamps a timestamp and the report filters on reviewed.before:now-1week
   so nothing resurfaces for a week. Progress lives on the items, so sessions stop and resume
   freely.
3. **git-standup** (https://github.com/kamranahmedse/git-standup, 7.8k stars). Prints your
   commits since the last working day across every repo below the current directory. The classic
   "recall yesterday" opener; its weakness (a printed wall, no next action) is the gap the
   walkthrough fills.
4. **Standup Raven** (https://github.com/standup-raven/standup-raven, 233 stars). Mattermost
   plugin: per-channel standup window, reminder at open and again at 80% with laggards tagged,
   auto-posted report at close that names who never filled theirs. States plainly which inputs it
   could not get.
5. **Comedian** (https://github.com/maddevsio/comedian, 56 stars, Go). Slack standups with
   accountability: warns non-submitters, tags people about deadlines, per-channel deadlines and
   roles, daily and weekly reports. The "chase" kind as first-class system behavior.
6. **ScrumAgent** (https://github.com/Shikenso-Analytics/ScrumAgent, 51 stars, AGPL). LLM scrum
   master bridging Discord and Taiga: one Discord thread per tracker story, stand-ups posted at
   08:00, hourly two-way sync so natural-language thread replies land back in the tracker. The
   inline-reply-routes-to-tracker idea already working in OSS.
7. **Thunderdome** (https://github.com/StevenWeathers/thunderdome-planning-poker, 494 stars).
   Planning poker, retros, story mapping, async check-ins, deliberately AI-free. Estimates as a
   per-story forced-choice card pick, recorded on the story.
8. **AsyncStatus** (https://github.com/AsyncStatus/asyncstatus, 446 commits, active). Generates
   status updates from GitHub and Slack activity; teammates amend; Slack bot asks on schedule and
   posts summaries; CLI offers git-style interactive editing. The generate-then-amend deal in
   product form.
9. **standup-for-one** (https://github.com/jnwrnr/standup-for-one, tiny but sharp). Two Claude
   Code commands for a solo person. `/standup` reads 7 days plus opted-in sources, replays
   yesterday's open tasks, triages mail, asks you to commit to today's focus, writes a structured
   daily markdown file. `/done` closes the day and pushes back: vague tasks get questioned, tasks
   with no anchor get questioned, and patterns get named ("Repeatedly deferred", "Blocker for 3+
   days").
10. **standup-report** (https://github.com/josephj/standup-report, Chrome Web Store). New-tab
    extension assembling your standup from Jira, GitHub PRs, and Calendar, so the standup is the
    page you land on. The placement insight, validated at small scale.

## Scan 2: commercial products that act like a PM

1. **Linear Pulse + Triage** (https://linear.app/changelog/2025-04-16-pulse,
   https://linear.app/docs/triage). Pulse: "For me" feed from explicit membership and
   subscriptions, plus an AI digest delivered daily or weekly into the Linear inbox, readable or
   as short audio. Triage: a holding inbox where every incoming item takes one of four single-key
   dispositions: accept (1), duplicate (2), decline (3), snooze (H, returns at a time or on new
   activity). Triage Intelligence pre-suggests assignee, labels, and duplicates.
2. **Height 2.0** (https://height.app; site refused connection during research, specifics from a
   Jan 2025 MarkTechPost profile, so treat as secondhand). Autonomy positioning: treats each
   message as an event, maps decisions from conversations into specs, auto-tags and estimates
   backlog additions, generates cadenced status reports from status changes, discussions, and
   blocked tasks.
3. **Spinach** (https://www.spinach.ai). Pre-standup, the bot prompts each person in Slack and
   pre-pulls their Jira tasks so prep costs seconds. In-meeting: shuffled speaking order, visible
   per-speaker timer, tangents parked in Team Topics. After: summary to Slack, suggested action
   items, decisions routed into Jira.
4. **Geekbot** (https://geekbot.com/standups/). Async DM protocol at each person's local reporting
   time; fixed question sequence (how do you feel / since yesterday / today / blockers); bot
   nudges non-submitters and broadcasts reports to a channel.
5. **DailyBot** (https://www.dailybot.com/product/check-ins/). Same collection pattern; the
   difference is the report layer: who responded, what they said, blockers flagged, plus
   summaries, blocker extraction, and risk signals. Check-in answers are structured data that
   downstream automations consume, not prose that scrolls away.
6. **Sunsama** (https://help.sunsama.com/docs/daily-planning). The product IS a guided ritual in
   fixed order: reflect on yesterday and close or carry unfinished items; pull today's candidates
   from Jira/Asana/Trello, backlog, and weekly goals; workload check summing estimates against
   your threshold with a warning and one-key deferrals when over; order and timebox; publish the
   plan to Slack/Teams. After 3 PM the flow plans tomorrow. An evening shutdown ritual mirrors it.
7. **Motion** (https://www.usemotion.com/features/ai-task-manager). Skips asking and schedules:
   surfaces your top priority each hour, reshuffles on interruptions, warns when a task is at risk
   of missing its deadline well in advance, with one-tap remedies (adjust deadline, request
   overtime, reassign).
8. **Basecamp automatic check-ins** (https://basecamp.com/features/automatic-check-ins). The
   pre-AI original: human-authored questions on a schedule, answers collected and published as
   browsable per-person history threads. Their help docs warn against stacking check-ins at the
   same time ("a recipe for ignored notifications").
9. **Bond / Donna** (https://www.bondapp.io/). 2025-vintage AI chief of staff living in Slack.
   Reads Slack, email, meetings, docs, Linear, Notion. Morning delivery framed as "you're all
   caught up. I handled most of the noise, here's what's left," ranked P0-P3, grouped by source
   and by "Needs you" vs delegated. Follow-up actions happen in the same surface.
10. **Microsoft Viva Briefing / Cortana** (post-mortem at
    https://office365itpros.com/2022/12/23/viva-briefing-pause/). Daily item injected into the
    Outlook mailbox, built from Graph signals; scanned your own sent mail to flag commitments you
    made and requests you made of others. Paused January 2023, never returned. Rated "moderately
    useful" as an action reminder; a briefing without inline action dies.

## Scan 3: ritual and triage UX mechanics

1. **Sunsama's 5-step wizard** (above): the closest full analog for flow order and the workload
   honesty check.
2. **Superhuman inbox zero** (https://blog.superhuman.com/inbox-zero-in-7-steps/). One decision
   per item from three verbs (done / remind me later with quick durations / keep and move on),
   split inbox pre-triage, and an empty state with defined meaning: everything left is what you
   decided to do today.
3. **HEY** (https://www.hey.com/how-it-works/). The Screener makes new senders earn their way in
   once (screen the source, not each item); approved mail routes by attention type (Imbox / Feed /
   Paper Trail); Reply Later is a visible stack, and Focus and Reply walks it one item at a time
   with the reply box inline.
4. **Linear Triage** (above): terminal dispositions on number keys; snooze with a dual return
   trigger.
5. **OmniFocus Review + Things 3 Today**
   (https://www.omnigroup.com/blog/Getting_active_with_OmniFocus_reviewing,
   https://calmevo.com/things-3-review/). Per-project review intervals, one at a time, "Mark
   Reviewed", partial reviews safe. Things: Today is short and hand-picked; Upcoming items
   hibernate until their start date auto-promotes them; no badges screaming counts.
6. **Triage.cc** (https://triage.cc/). Inbox as a stack of cards, one at a time: flick up =
   archive, flick down = keep, tap = expand, optional short reply. Reviewers: one excerpt at a
   time "makes my inbox seem less daunting."
7. **Gmail Priority Inbox** (https://research.google.com/pubs/archive/36955.pdf). Per-user
   act-probability ranking rendered as visible sections, correctable in place, with Everything
   Else kept visible below rather than hidden.
8. **Duolingo session framing** (https://growth.design/case-studies/duolingo-user-retention). One
   big start button, a progress bar during the session, a daily goal that defines "enough," and
   explicit exit points after the goal ("otherwise it feels like a never-ending list of tasks").
   Streak pressure cuts both ways; do not guilt-streak a standup.
9. **Range check-ins** (https://www.range.co/product/check-ins). Answers pre-filled from
   GitHub/Asana/calendar so the user confirms rather than recalls; blockers get flagged for the
   next meeting instead of demanding immediate discussion; "stay informed in 5 minutes."
10. **Smart Brevity / Morning Brew format** (https://www.axioshq.com/hubfs/smart-brevity-101.pdf).
    Small fixed item count; each item: bolded one-line lead, "Why it matters," capped bullets,
    "Go deeper" link; identical format daily so scanning becomes muscle memory; advertised read
    time.

## Scan 4: LLM morning-brief builds

1. **Daily Briefing Agent** (https://github.com/RheingoldAI/daily-briefing-agent). Claude Code
   skill over Microsoft 365 MCP: calendar today, unread mail 3 days, flagged 30 days, Teams
   mentions 3 days. On-demand `/briefing` plus scheduled 8:30 AM. Four color tiers; "appears in
   multiple channels" promotes an item. Read-only, no memory.
2. **claude-chief-of-staff** (https://github.com/mimurchison/claude-chief-of-staff). `/gm` morning
   brief and `/triage` over Gmail/GCal/Slack; goals.yaml is the ranking source of truth; Claude
   pushes back when time allocation drifts from stated goals. Drafts emails from the brief.
3. **COS** (https://www.gotcos.com/, starter: https://github.com/ukaoma/cos-starter). Context
   graph over Slack, Gmail, Calendar, transcripts, CRM, Notion; `/start` builds the morning brief;
   `/learn` appends corrections to corrections.md which steers future briefs.
4. **ai-chief-of-staff** (https://github.com/mboverell/ai-chief-of-staff). Obsidian-vault agents;
   daily 6 AM Telegram brief; weekly review synthesizes meetings, calendar, email, and git commits
   and catches "open loops and slippage."
5. **OpenJarvis Morning Brief** (https://open-jarvis.github.io/OpenJarvis/showcase/morning-brief/).
   Fully local, cron 7 AM, exactly five bullets to Discord, ~2-minute read. A 👎 reaction writes
   to MEMORY.md and that class of item stops appearing.
6. **Harper Reed's email agent writeup**
   (https://harper.blog/2025/12/03/claude-code-email-productivity-mcp-agents/). After an agent
   once sent mail without approval, everything became draft-only: "every email, but only a little,
   and maybe less and less."
7. **Claude routines daily brief**
   (https://www.anothercodingblog.com/p/i-built-a-daily-brief-with-claude). Scheduled cloud
   routine: close out yesterday's finished items first, then write today's page. "Interactive
   skill = helpful assistant. Routine skill = production job."
8. **AutoStand-UP-Agent** (https://github.com/emanalytic/AutoStand-UP-Agent). GitHub Actions cron;
   last 24h of commits/PRs plus tracker tasks; per-person done/doing/blockers scaffold merged into
   one team summary posted to chat.
9. **Linear Pulse** (above): digest as a summary of an already-personalized feed; relevance from
   the explicit graph first.
10. **LLM notification composition paper** (https://arxiv.org/abs/2605.16264). Budget-aware
    routing, grounded generation, ranking, diversity controls, online learning; novelty and
    linguistic freshness scored explicitly; cap enforced by a frequency layer outside the prompt.

Anthropic's own daily-brief recipe
(https://claude.com/resources/use-cases/build-a-daily-briefing-across-your-tools) has the user
declare the urgency rubric in the prompt and merges cross-tool context into single items.

## What this maps to in the Workbench walkthrough

- The four PM kinds are the differentiator; no product mixes them. Ballpark-as-a-question is
  nearly absent in the wild; collect it as preset chips (rule 5).
- The cap needs a visibly parked remainder with return triggers (rules 3 and 4). The "quiet line"
  becomes a named parked list; snoozes return on date or new ticket activity.
- Reply vocabulary per item: do it / done / snooze until / not mine, plus chips for ballparks and
  a one-line free text routed as a Jira comment, worklog, or a drafted email (drafts only, rule 6;
  already house law).
- Anti-repetition ledger: stamp each item with last-walked and last-answered; close out yesterday
  before writing today. Weekly Status already checks the last three weeks to avoid repeated
  bullets, so the pattern has in-house precedent.
- Trust tags per item from source freshness. TodaySnapshot already records per-source
  observations (jira / agentBoard / reconciliation / loop with status and observedAt); surface
  them per item, Scout-style.
- Designed end: a "walkthrough clear" state with meaning, one click into Work for everything
  else. Optional workload check using IssueTimeMetrics' derived remaining time.
- The system owns chasing and may push back once on a weak answer, and can name avoidance
  patterns ("deferred three briefs running").
