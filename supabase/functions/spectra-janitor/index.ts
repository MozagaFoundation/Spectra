import { janitorWorker } from '../_shared/workers.ts'

Deno.serve(janitorWorker)
