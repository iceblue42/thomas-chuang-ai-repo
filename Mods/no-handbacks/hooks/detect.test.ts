import { describe, expect, test } from 'claude-code/testing'

import { detectHandback, endsWithQuestion, isActivation, isHoldPrompt, isHoldingReply } from './detect'

const F = '```'

// [name, final message, hit, ownerBlock, nonPs51]
const CASES: [string, string, boolean, boolean, boolean][] = [
  [
    'powershell block for the owner',
    `Run this in PowerShell to add the allowance:\n\n${F}powershell\nAdd-MpPreference -ExclusionPath 'E:\\Claude'\n${F}`,
    true, true, false,
  ],
  ['done, nothing handed back', "I've deployed it. The site is live at https://example.com and the health check passes.", false, false, false],
  ['hardware step only', 'Reseat the RAM stick in slot A2, then boot and I will rerun the memory test.', false, false, false],
  ['password at the prompt', 'Enter your password at the prompt when Windows asks for it.', false, false, false],
  ["you'll need to type a password", "You'll need to type your password into the UAC dialog; I can't do that part.", false, false, false],
  ['later item with inline command', 'Everything is wired up. You can run `npm test` later to confirm.', true, false, false],
  [
    'bash heredoc for the owner',
    `Paste this into your terminal:\n\n${F}bash\ncat <<'EOF' > ~/.ssh/config\nHost box\n  User tommy\nEOF\n${F}`,
    true, true, true,
  ],
  [
    'bash && chain addressed with "run:"',
    `To finish the install, run:\n\n${F}bash\ncd E:/Claude/EVI && npm install && npm run build\n${F}`,
    true, true, true,
  ],
  [
    'block Claude shows of what it ran',
    `I ran the build:\n\n${F}powershell\nnpm run build\n${F}\n\nIt passed with no warnings.`,
    false, false, false,
  ],
  [
    'block of what Claude will run next',
    `Next I'll run:\n\n${F}powershell\nnpm test\n${F}`,
    false, false, false,
  ],
  ['manual step for the owner', 'Docker is installed. You will have to restart the WSL distro manually for the change to take effect.', true, false, false],
  ['Claude did it manually', 'I manually patched the config and restarted the service; it is healthy now.', false, false, false],
  ['on your end', 'The fix is pushed. Pull the branch on your end and restart the dev server.', true, false, false],
  ['for you to do', "I've left the migration script in scripts/migrate.ps1 for you to run once the backup finishes.", true, false, false],
  ['next time you', 'Next time you open the project, run `git pull` first.', true, false, false],
  ['copy and paste', 'Copy and paste the snippet below into settings.json under "env".', true, false, false],
  [
    'json block to add to a file',
    `Add the following to your settings.json:\n\n${F}json\n{ "env": { "FOO": "1" } }\n${F}`,
    true, false, false,
  ],
  ['BIOS step', 'In the BIOS, disable XMP and set the DRAM voltage back to Auto; that one needs you at the machine.', false, false, false],
  [
    'refused permission, command for the owner',
    `My attempt was denied by the permission prompt. Run this in an elevated PowerShell:\n\n${F}powershell\nSet-Service -Name WSearch -StartupType Disabled\n${F}`,
    true, false, false,
  ],
  ['code block of source, not a command', `Here is the new function:\n\n${F}ts\nexport const add = (a: number, b: number) => a + b\n${F}`, false, false, false],
  [
    'untagged block for the owner',
    `In your terminal, run:\n\n${F}\nssh tommy@box 'sudo systemctl restart ollama'\n${F}`,
    true, true, false,
  ],
  ['empty answer', '', false, false, false],

  // False positives seen in real sessions: these must stay quiet.
  [
    'permission mode / allow rule is the owner\'s',
    'What you need to do to finish the deploy: run the next session out of auto mode, or allow `ssh evi-admin-vps` for it.',
    false, false, false,
  ],
  ['bypass permissions mode', 'You will need to restart this session in bypass permissions mode for the installer to run.', false, false, false],
  ['allow rule after the classifier refused', "You'll need to add an allow rule for the deploy; the auto-mode classifier refused `ssh evi-admin-vps`.", false, false, false],
  ['account tied to Google', 'If your NTUC Link account is tied to Google, the fix is on your side.', false, false, false],
  ['Singpass sign-in retry', "You'll need to retry the Singpass sign-in on your phone.", false, false, false],
  ['signing in with 2FA', 'You have to finish signing in to the portal; it wants a 2FA code.', false, false, false],
  ['OAuth consent', 'You will need to click Allow on the OAuth consent screen.', false, false, false],
  ['markdown link in prose', 'The full prompt is in a file above ([NEXT-SESSION-PROMPT-phase5.md](E:/Claude/EVI/.mab/NEXT-SESSION-PROMPT-phase5.md)).', false, false, false],
  [
    'pasted session prompt with a link above it is not a shell block',
    `Paste this into the new session; it is also in a file above ([NEXT-SESSION-PROMPT-phase5.md](E:/Claude/EVI/.mab/NEXT-SESSION-PROMPT-phase5.md)):\n\n${F}\nResume MAB run 1009 at Phase 5. Read STATE.md, then run the gates: npm test && npm run build.\n${F}`,
    true, false, false,
  ],
  [
    'markdown block is not a shell block',
    `Run this check:\n\n${F}markdown\nSee [notes](E:/x.md) && <<EOF\n${F}`,
    true, false, false,
  ],

  [
    'summary quoting example phrases',
    "Useful nudges keep firing: 'run this on the VPS and paste me the output', 'paste this into the new session', bash commands left for you.",
    false, false, false,
  ],
  ['double-quoted phrases', 'The prefilter matched "you will need to restart it manually" and "run this later".', false, false, false],
  ['curly-quoted phrases', 'It flagged “paste this into your terminal” and ‘you can run it later’ in the summary.', false, false, false],
  ['cue words only in inline code', 'The regex now covers `you can run` and `for you to`.', false, false, false],
  ["apostrophes are not quotes", "You'll need to restart the dev server; it won't pick up the env change.", true, false, false],
  // 2026-10-12..16: status lines that cost a full nudge turn for "nothing here is for you".
  [
    'status line mentioning later sessions',
    "Run 1's O1 is still planning, and the relay will take later sessions from the spares, so it shouldn't need you to start anything.",
    false, false, false,
  ],
  ['waiting-on-you list with later', '- later, your supervised browser session and Gate R.', false, false, false],
  ['a page you can open', "It'll be published as a page you can open and share.", false, false, false],
  ['checks in your console (an app console)', 'R3-27: the native-browser chat checks in your console.', false, false, false],

  // Handbacks seen in real sessions that were worth the nudge: keep firing.
  [
    'run this on the VPS and paste me the output',
    `Run this on the VPS and paste me the output:\n\n${F}bash\nsudo journalctl -u evi -n 50 --no-pager\n${F}`,
    true, true, true,
  ],
  [
    'paste this into the new session',
    `Paste this into the new session:\n\n${F}\nResume the run from .mab/STATE.md and finish Phase 6.\n${F}`,
    true, false, false,
  ],
  ['what you need to do next session', 'What you need to do next session:\n- run the migration\n- restart the API service', true, false, false],
  [
    'untagged PowerShell block for the owner',
    `In your terminal, run:\n\n${F}\nGet-Service WSearch | Stop-Service\n${F}`,
    true, true, false,
  ],
  [
    'untagged block with a prompt prefix and &&',
    `Run this in PowerShell:\n\n${F}\n$ npm install && npm run build\n${F}`,
    true, true, true,
  ],
]

describe('detectHandback', () => {
  for (const [name, text, hit, ownerBlock, nonPs51] of CASES) {
    test(name, () => {
      const d = detectHandback(text)
      expect({ hit: d.hit, ownerBlock: d.ownerBlock, nonPs51: d.nonPs51 }).toEqual({ hit, ownerBlock, nonPs51 })
      if (hit) expect(d.quote.length).toBeGreaterThan(0)
    })
  }

  test('quote is the handback sentence, short and without double quotes', () => {
    const d = detectHandback('All set. You can run "npm test" later to confirm. ' + 'x'.repeat(300))
    expect(d.quote.startsWith("You can run 'npm test' later")).toBe(true)
    expect(d.quote.length).toBeLessThanOrEqual(140)
  })
})

describe('held sessions', () => {
  const ARMED =
    'Invoke the multi-agent-building skill in hold mode: `hold W-D`.\nProject: E:/Claude/EVI  ·  Run: 1009  ·  Task: deploy'
  // [name, text, holdPrompt, holdingReply, activation]
  const HOLD: [string, string, boolean, boolean, boolean][] = [
    ['armed holding prompt', ARMED, true, false, false],
    ['local pipeline holding prompt', ARMED.replace('multi-agent-building', 'multi-agent-building-local'), true, false, false],
    ['slash hold', '/multi-agent-building hold W-D', true, false, false],
    ['MAB session holding prompt', 'You are session MAB P5 Holding 3 for the EVI run. Read the brief. Standby for activation.', true, true, false],
    ['hold mode mentioned deep in a long prompt', `${'Tune the nudge mod. '.repeat(40)}It misfired in hold mode: \`hold W-D\`.`, false, false, false],
    ['ordinary prompt', 'Fix the login page and deploy it.', false, false, false],
    [
      'registered as HOLDING, waiting for ACTIVATE',
      "W-D is registered as HOLDING in `lanes/D.md` and waiting for `ACTIVATE W-D` from P6-O2, or for you to type 'activate'.",
      false, true, true,
    ],
    ['the reply hold mode asks for', 'Holding as W-D. Activate with "ACTIVATE W-D" or type "activate".', false, true, true],
    ['standing by', 'Standing by for activation.', true, true, false],
    ['ACTIVATE from the orchestrator', 'Another Claude session sent a message: ACTIVATE W-D', false, false, true],
    ['person types activate', ' Activate. ', false, false, true],
    ['activate inside a sentence is not activation', 'activate the venv and run the tests', false, false, false],
    ['done reply', 'Deployed; the health check passes.', false, false, false],
  ]
  for (const [name, text, prompt, reply, activation] of HOLD) {
    test(name, () => {
      expect({ prompt: isHoldPrompt(text), reply: isHoldingReply(text), activation: isActivation(text) }).toEqual({
        prompt,
        reply,
        activation,
      })
    })
  }
})

describe('endsWithQuestion', () => {
  test('a closing question', () => {
    expect(endsWithQuestion('I found two options. Do you want the fast one or the safe one?')).toBe(true)
  })
  test('a closing bold question', () => {
    expect(endsWithQuestion('Done.\n\n**Should I also update the docs?**')).toBe(true)
  })
  test('a statement', () => {
    expect(endsWithQuestion('Done. Why it failed? The cache was stale. Fixed now.')).toBe(false)
  })
  test('ends with a code block', () => {
    expect(endsWithQuestion(`Want this?\n${F}powershell\nGet-Date\n${F}`)).toBe(false)
  })
})
