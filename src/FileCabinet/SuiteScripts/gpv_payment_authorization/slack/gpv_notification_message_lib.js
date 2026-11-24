/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Pure Slack messages: the approver's DM and the treasury notice.
 */
define(['./gpv_proposal_message_lib'], (proposalMessage) => {
  const { formatAmount } = proposalMessage;
  /**
   * Escapes text from NetSuite (vendor names, bill numbers) so Slack shows it literally and it
   * cannot become a mention (<!channel>) or a link.
   * @param {string} text
   * @returns {string}
   */
  const escapeMrkdwn = (text) =>
    String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  /**
   * @param {Record<string, number>} totals
   * @returns {string} e.g. "MXN $1,500.00 · USD $20.00"
   */
  const formatTotals = (totals) =>
    Object.keys(totals)
      .sort()
      .map((code) => `${code} $${formatAmount(totals[code])}`)
      .join(' · ');

  /**
   * @param {Record<string, number>[]} list
   * @returns {Record<string, number>}
   */
  const mergeTotals = (list) => {
    /** @type {Record<string, number>} cents per currency */
    const cents = {};
    list.forEach((totals) =>
      Object.entries(totals).forEach(([code, amount]) => {
        cents[code] = (cents[code] || 0) + Math.round(amount * 100);
      }),
    );
    return Object.fromEntries(Object.entries(cents).map(([code, c]) => [code, c / 100]));
  };

  /**
   * Message with a bold title, detail lines and one link button to NetSuite.
   * @param {string} title
   * @param {string} detail Slack mrkdwn, already escaped.
   * @param {string} buttonText
   * @param {string} buttonUrl
   * @param {string} actionId
   */
  const withButton = (title, detail, buttonText, buttonUrl, actionId) => ({
    text: title,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*${title}*\n${detail}` } },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            style: 'primary',
            action_id: actionId,
            text: { type: 'plain_text', text: buttonText },
            url: buttonUrl,
          },
        ],
      },
    ],
  });

  /**
   * DM to an approver with everything waiting for them, and a button to the Approval Center.
   * @param {{ meetingDate: string, levelName: string, lines: unknown[], totals: Record<string, number> }[]} groups
   *   Same groups the Approval Center shows for this employee.
   * @param {string} centerUrl
   * @returns {{ text: string, blocks: object[] }|null} null when nothing is waiting.
   */
  const buildApproverDm = (groups, centerUrl) => {
    const count = groups.reduce((sum, g) => sum + g.lines.length, 0);
    if (!count) return null;
    const title = `Tienes ${count} ${count === 1 ? 'factura' : 'facturas'} por autorizar`;
    const detail = [
      ...groups.map(
        (g) =>
          `• Concentrado del ${escapeMrkdwn(g.meetingDate)} · ${escapeMrkdwn(g.levelName)}: ${g.lines.length}`,
      ),
      `Total: ${formatTotals(mergeTotals(groups.map((g) => g.totals)))}`,
    ].join('\n');
    return withButton(title, detail, 'Ver en NetSuite', centerUrl, 'gpv_open_center');
  };

  /**
   * Short notice to the treasury channel: how many bills were just authorized, their total and
   * a button to the authorized view, where the bills are listed.
   * @param {{ amount: number, currency: string }[]} lines Lines that were just authorized.
   * @param {string} viewUrl
   * @returns {{ text: string, blocks: object[] }|null} null when there is nothing to tell.
   */
  const buildTreasuryMessage = (lines, viewUrl) => {
    if (!lines.length) return null;
    const n = lines.length;
    const title = `${n} ${n === 1 ? 'factura autorizada' : 'facturas autorizadas'} para pago`;
    const total = `Total: ${formatTotals(mergeTotals(lines.map((l) => ({ [l.currency]: l.amount }))))}`;
    return withButton(title, total, 'Ver autorizadas', viewUrl, 'gpv_open_authorized');
  };

  /**
   * Confirmation DM to whoever just approved: how many, total, and where they went.
   * @param {object} options
   * @param {{ amount: number, currency: string }[]} options.lines Lines just approved.
   * @param {{ levelName: string, count: number }[]} options.nextLevels Lines that moved on.
   * @param {number} options.authorizedCount Lines that got the last approval.
   * @returns {string|null} Slack mrkdwn, null when nothing was approved.
   */
  const buildApprovalConfirmation = ({ lines, nextLevels, authorizedCount }) => {
    if (!lines.length) return null;
    const n = lines.length;
    return [
      `*✅ Aprobaste ${n} ${n === 1 ? 'factura' : 'facturas'}*`,
      `Total: ${formatTotals(mergeTotals(lines.map((l) => ({ [l.currency]: l.amount }))))}`,
      ...nextLevels.map(
        ({ levelName, count }) =>
          `• ${count} ${count === 1 ? 'pasa' : 'pasan'} a ${escapeMrkdwn(levelName)}`,
      ),
      ...(authorizedCount
        ? [
            `• ${authorizedCount} ${authorizedCount === 1 ? 'quedó autorizada' : 'quedaron autorizadas'} para pago`,
          ]
        : []),
    ].join('\n');
  };

  return { escapeMrkdwn, buildApproverDm, buildTreasuryMessage, buildApprovalConfirmation };
});
