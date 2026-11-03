import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import { POST_OUTCOME_SCRIPT, chronologicalFeedUrl, pollPostOutcome, reconcileFeedPost } from '../src/composer.js';
const MESSAGE_SELECTOR = '[data-ad-preview="message"], [data-ad-comet-preview="message"]';
function outcome(text, { stale = false, dialog = false, body = '', submission, articles = [], pathname = '/groups/test/' } = {}) {
  const node = { innerText: text, hidden: false, offsetParent: {}, getAttribute: () => null, querySelector: () => null };
  const baseline = new Map(stale ? [[node, text]] : []);
  return vm.runInNewContext(POST_OUTCOME_SCRIPT, {
    Map, URL, location: { href: 'https://www.facebook.com' + pathname, origin: 'https://www.facebook.com', pathname },
    window: { __opencliPostNotices: baseline, __opencliPostSubmission: submission },
    getComputedStyle: () => ({}),
    document: { body: { innerText: body }, querySelectorAll: selector => selector === MESSAGE_SELECTOR ? articles.map(unit => unit.message) : selector === '[role="dialog"]' ? (dialog ? [{ ...node, querySelector: () => ({}), getBoundingClientRect: () => ({ width: 1, height: 1, top: 0 }) }] : []) : [node] },
  });
}
describe('publication evidence', () => {
  it('does not equate a closed composer with success', () => expect(outcome('').status).toBe('waiting'));
  it('ignores old success notifications', () => expect(outcome('Post published', { stale: true }).status).toBe('waiting'));
  it('ignores success text in feed or caption', () => expect(outcome('', { body: 'Post published' }).status).toBe('waiting'));
  it.each(['Post published', 'Bài viết của bạn đã được đăng'])('recognizes new success notice %s', text => expect(outcome(text).status).toBe('posted'));
  it('waits while composer remains open', () => expect(outcome('Post published', { dialog: true }).status).toBe('waiting'));
  it.each([['Your post is pending approval', 'pending-review'], ['Không thể đăng', 'failed']])('recognizes %s', (text, status) => expect(outcome(text).status).toBe(status));
  it('returns unknown when evidence never arrives', async () => {
    expect((await pollPostOutcome({ evaluate: async () => ({ status: 'waiting', composer_open: false }) }, { timeoutMs: 1, intervalMs: 1 }))).toMatchObject({ status: 'unknown', composer_open: false });
  });
});

describe('feed evidence without a success notification', () => {
  const url = 'https://www.facebook.com/groups/test/posts/123';
  const submission = { caption: 'Muse AI caption', url: 'https://www.facebook.com/groups/test/', startedAt: Date.now(), previousPosts: [] };
  function article({ caption = submission.caption, href = url, time = 'Just now', extraLinks = [] } = {}) {
    const link = h => ({ href: h, innerText: time, getAttribute: name => name === 'href' ? h : null, querySelector: () => null });
    const unit = { offsetParent: {}, getAttribute: () => null, querySelectorAll: () => [...extraLinks.map(link), link(href)] };
    unit.message = { innerText: caption, closest: () => unit };
    unit.querySelector = () => unit.message;
    return unit;
  }
  it('verifies a fresh new group post and returns its permalink', () => {
    expect(outcome('', { submission, articles: [article()] })).toMatchObject({ status: 'posted', evidence: 'feed-post', post_url: url });
  });
  it('builds the permalink from an insights link when the timestamp link is obfuscated', () => {
    const post = article({ href: '/groups/test/post_insights/124/?__cft__[0]=x', time: '7͏\nh͏' });
    expect(outcome('', { submission: { ...submission, previousPosts: ['123'] }, articles: [post] }))
      .toMatchObject({ status: 'posted', post_url: 'https://www.facebook.com/groups/test/posts/124' });
  });
  it('matches a long caption truncated behind See more with emoji dropped', () => {
    const caption = 'Một paper đáng đọc về AI agents 🤖 nhóm Wavestone AI Lab đã mổ xẻ Claude Code và Codex, rồi tìm ra blueprint chung';
    const post = article({ caption: 'Một paper đáng đọc về AI agents nhóm Wavestone AI Lab đã mổ xẻ Claude Code… See more' });
    expect(outcome('', { submission: { ...submission, caption }, articles: [post] }).status).toBe('posted');
  });
  it('drops keycap emoji digits that the feed renders as images', () => {
    const post = article({ caption: 'Tổng hợp 9 pattern từ đơn giản đến phức tạp Single Agent một LLM xử lý mọi việc… See more' });
    const caption = 'Tổng hợp 9 pattern từ đơn giản đến phức tạp\n1\ufe0f\u20e3 Single Agent một LLM xử lý mọi việc\n2\ufe0f\u20e3 Multi Agent';
    expect(outcome('', { submission: { ...submission, caption }, articles: [post] }).status).toBe('posted');
  });
  it('ignores emoji variation selectors the feed preview drops', () => {
    const post = article({ caption: 'Elon Musk cảnh báo AI và robotics có thể khiến công việc thay đổi trong 10 năm… See more' });
    expect(outcome('', { submission: { ...submission, caption: '\u26a0\ufe0f Elon Musk cảnh báo AI và robotics có thể khiến công việc thay đổi trong 10 năm tới 1\ufe0f\u20e3' }, articles: [post] }).status).toBe('posted');
  });
  it.each([
    ['old matching post', { ...submission, previousPosts: ['123'] }, article()],
    ['stale matching post', submission, article({ time: 'Yesterday' })],
    ['matching post older than the baseline', { ...submission, previousPosts: ['200'] }, article({ time: 'Yesterday' })],
    ['different caption', submission, article({ caption: 'Other text' })],
    ['short truncated prefix', { ...submission, caption: 'Muse AI caption that continues for a long time afterwards' }, article({ caption: 'Muse… See more' })],
    ['embedded share from elsewhere', submission, article({ href: 'https://www.facebook.com/somepage/posts/123' })],
  ])('rejects %s', (_, baseline, post) => {
    expect(outcome('', { submission: baseline, articles: [post] }).status).toBe('waiting');
  });
  it('verifies a profile photo post by its new photo fbid', () => {
    const profile = { ...submission, url: 'https://www.facebook.com/tpd0590/', previousPosts: ['100'] };
    const post = article({ href: 'https://www.facebook.com/photo/?fbid=200&set=a.9&__cft__[0]=x', time: '' });
    expect(outcome('', { submission: profile, articles: [post], pathname: '/tpd0590/' }))
      .toMatchObject({ status: 'posted', post_url: 'https://www.facebook.com/photo/?fbid=200' });
  });
  it('does not treat a group photo fbid as the group post ID', () => {
    const post = article({ href: 'https://www.facebook.com/photo/?fbid=200&set=a.9', time: '' });
    expect(outcome('', { submission: { ...submission, previousPosts: ['100'] }, articles: [post] }).status).toBe('waiting');
  });
  it('does not override a moderation notice with feed evidence', () => {
    expect(outcome('Your post is pending approval', { submission, articles: [article()] }).status).toBe('pending-review');
  });
});

describe('feed reconciliation after an unclear outcome', () => {
  it('sorts the group feed newest first', () => {
    expect(chronologicalFeedUrl('https://www.facebook.com/groups/hociot')).toBe('https://www.facebook.com/groups/hociot?sorting_setting=CHRONOLOGICAL');
  });
  it('never navigates without a pre-submission baseline', async () => {
    const page = { goto: async () => { throw new Error('navigated'); } };
    expect(await reconcileFeedPost(page, 'https://www.facebook.com/groups/test', { caption: 'x', previousPosts: [] })).toBeNull();
  });
  it('returns posted evidence found on the reloaded feed', async () => {
    const visited = [];
    const page = { goto: async url => visited.push(url), evaluate: async () => ({ status: 'posted', evidence: 'feed-reload', post_url: 'u' }) };
    const result = await reconcileFeedPost(page, 'https://www.facebook.com/groups/test', { caption: 'x', previousPosts: ['1'], timeoutMs: 1, intervalMs: 1 });
    expect(visited).toEqual(['https://www.facebook.com/groups/test']);
    expect(result).toMatchObject({ status: 'posted', evidence: 'feed-reload' });
  });
  it('returns null when the reloaded feed still lacks evidence', async () => {
    const page = { goto: async () => {}, evaluate: async () => ({ status: 'waiting' }) };
    expect(await reconcileFeedPost(page, 'https://www.facebook.com/groups/test', { caption: 'x', previousPosts: ['1'], timeoutMs: 1, intervalMs: 1 })).toBeNull();
  });
});
