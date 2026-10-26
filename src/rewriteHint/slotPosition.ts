import { imageAnchors } from './move';

/**
 * 重写提示词时报上每张图在正文里的位置(本 fork 新增)。
 *
 * 重写走原位替换,模型返回的 position 不参与写回;但协议仍要它填 position,
 * 正文里的 tag 又已剔掉,不告诉它位置,它就会对着几百段正文推算每张图原来在哪(白费输出)。
 * 段落编号与发给模型的正文同一口径(stripImageTags 后 prepareTargetText 切段)。
 */
export function slotPositionNote(rawSource: string, seqs: number[], stripTags: string[]): string {
  const anchors = imageAnchors(rawSource ?? '', stripTags);
  if (!anchors.length) return '';
  const at = (id: string) => (id ? `${id} 之后` : '正文开头');
  const targets = seqs
    .map(seq => anchors.find(a => a.seq === seq))
    .filter((a): a is { passageId: string; seq: number } => !!a);
  const lines = ['【位置已定，不用推算】本楼每张图在正文里的位置如下；要改的图写回时原位替换，不会挪动。'];
  if (targets.length) {
    lines.push(
      `images 每项的 position 直接照抄：${targets.map((a, i) => `第 ${i + 1} 项填 ${a.passageId || 'P1'}`).join('，')}。`,
    );
  }
  lines.push(anchors.map(a => `第 ${a.seq + 1} 张：${at(a.passageId)}`).join('；'));
  return lines.join('\n');
}

/** 接在单张 / 一起改的任务备注后面。 */
export function withSlotPositions(note: string, rawSource: string, seqs: number[], stripTags: string[]): string {
  const positions = slotPositionNote(rawSource, seqs, stripTags);
  return positions ? `${note}\n\n${positions}` : note;
}
