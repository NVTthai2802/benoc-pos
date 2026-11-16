// Webhook SePay cho môi trường TEST: https://benoc-pos.pages.dev/api/sepay-test
import { handle } from '../_lib/sepay.js';
export const onRequest = ({ request }) => handle(request, 'test');
