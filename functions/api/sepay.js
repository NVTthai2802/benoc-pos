// Webhook SePay cho quán thật (PRODUCT): https://benoc-pos.pages.dev/api/sepay
import { handle } from '../_lib/sepay.js';
export const onRequest = ({ request }) => handle(request, 'product');
