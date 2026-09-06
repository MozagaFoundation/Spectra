import { notificationWorker } from '../_shared/workers.ts'

Deno.serve(notificationWorker)
