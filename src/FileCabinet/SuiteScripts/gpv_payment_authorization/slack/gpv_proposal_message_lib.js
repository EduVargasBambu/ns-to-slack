/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Pure text of the weekly proposal summary posted to the AP channel.
 */
define([], () => {
  /**
   * 1234567.5 -> "1,234,567.50". Manual so it does not depend on Intl data on the server.
   * @param {number} amount
   * @returns {string}
   */
  const formatAmount = (amount) => {
    const [int, dec] = Math.abs(amount).toFixed(2).split('.');
    const sign = amount < 0 ? '-' : '';
    return `${sign}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`;
  };

  /**
   * @param {object} summary
   * @param {string} summary.meetingDate Already formatted for the user, e.g. "23/11/2026".
   * @param {number} summary.billCount
   * @param {Record<string, number>} summary.totals Amount per currency code.
   * @param {{ name: string, count: number }[]} summary.pendingByLevel In level order.
   * @param {number} summary.authorizedCount Bills that were born authorized.
   * @returns {string} Slack mrkdwn text.
   */
  const buildProposalSummary = ({
    meetingDate,
    billCount,
    totals,
    pendingByLevel,
    authorizedCount,
  }) => {
    if (!billCount) {
      return `*Concentrado de la junta del ${meetingDate}*\nNo hay facturas pendientes de autorizar esta semana.`;
    }
    const totalLines = Object.entries(totals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, amount]) => `• ${code}: $${formatAmount(amount)}`);
    const levelLines = pendingByLevel
      .filter(({ count }) => count > 0)
      .map(({ name, count }) => `• ${name}: ${count}`);
    if (authorizedCount) levelLines.push(`• Ya autorizadas: ${authorizedCount}`);

    return [
      `*Concentrado de la junta del ${meetingDate}*`,
      `${billCount} ${billCount === 1 ? 'factura' : 'facturas'} por autorizar.`,
      '',
      '*Totales*',
      ...totalLines,
      '',
      '*Esperando a*',
      ...levelLines,
    ].join('\n');
  };

  return { formatAmount, buildProposalSummary };
});
