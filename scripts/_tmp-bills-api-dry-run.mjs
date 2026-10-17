#!/usr/bin/env node
// TEMPORARY investigation script — confirms bills-api.parliament.uk is
// reachable from a GitHub-hosted runner (not just this machine) before
// any production Bills-to-Watch automation is built. Fetch-and-print
// only; writes nothing, commits nothing. Delete after use.

const BILL_IDS = [4035, 4129, 4140];

for (const id of BILL_IDS) {
  const url = `https://bills-api.parliament.uk/api/v1/Bills/${id}`;
  try {
    const res = await fetch(url);
    console.log(`Bill ${id}: HTTP ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      console.log(`  shortTitle: ${data.shortTitle}`);
      console.log(`  currentStage: ${data.currentStage.description} (${data.currentStage.house})`);
    } else {
      console.log(`  body: ${(await res.text()).slice(0, 200)}`);
    }
  } catch (err) {
    console.log(`Bill ${id}: FETCH ERROR — ${err.message}`);
  }
}
