/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 * @description Saturday job: pending lines expire, their bills return to the pending pool and
 * open proposals close. Authorized lines are not touched.
 */
define(['N/runtime', 'N/task', '../lib/gpv_expiry_service_lib'], (
  /** @type {typeof import('N/runtime')} */ runtime,
  /** @type {typeof import('N/task')} */ task,
  expiryService,
) => {
  const TITLE = 'gpv_weekly_expiry_ss';
  /** Units kept to close the proposals after the last line. */
  const RESERVED_USAGE = 200;

  const execute = () => {
    const script = runtime.getCurrentScript();
    const result = expiryService.expirePendingLines({
      hasBudget: () => script.getRemainingUsage() > RESERVED_USAGE,
    });

    if (!result.done) {
      const taskId = task
        .create({
          taskType: task.TaskType.SCHEDULED_SCRIPT,
          scriptId: script.id,
          deploymentId: script.deploymentId,
        })
        .submit();
      log.audit(TITLE, `${result.expiredCount} líneas vencidas; continúa en la tarea ${taskId}.`);
      return;
    }
    log.audit(
      TITLE,
      `${result.expiredCount} líneas vencidas, ${result.closedCount} concentrados cerrados.`,
    );
  };

  return { execute };
});
