<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Skill Usage

- Perform skill routing for every user task before answering or acting, including simple questions.
- Invoke any skill that plausibly applies to the task.
- Select skills automatically from the user's task.
- Briefly name the skills being used before meaningful work starts.
- Do not ask the user to choose skills for routine work.
- Ask first only when the route is materially ambiguous, high-cost, global, destructive, external, or the goal is unclear.
- Use the smallest relevant skill set. Avoid loading broad domain skills unless the task explicitly matches them.
