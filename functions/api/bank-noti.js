// Thông báo chuyển khoản từ app Android (PRODUCT): https://benoc-pos.pages.dev/api/bank-noti
import { handleNoti } from '../_lib/bank-noti.js';
export const onRequest = ({ request }) => handleNoti(request, 'product');
