// Shared lifecycle for post-person, post-group and all post-clone commands.
// Browser Bridge owns the session; this never launches or terminates Chrome.
export async function closeTaskSession(page, ownedTab) {
  if (!ownedTab) return;
  if (typeof page?.closeTab !== 'function') {
    throw new Error('Browser Bridge does not support closing the owned task tab');
  }

  // Close the exact tab created by this command. closeWindow() routes through a
  // session-wide owned-tab cleanup call that can hang after an adapter succeeds.
  await page.closeTab(ownedTab);

  // OpenCLI's outer lifecycle normally calls closeWindow() after the command.
  // The owned task tab is already closed, so suppress a second Bridge request.
  if (typeof page.closeWindow === 'function') page.closeWindow = async () => {};
}
