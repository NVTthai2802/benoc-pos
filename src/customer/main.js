/* Trang khách: bản React mặc định, ?cu=1 dùng lại bản cũ */
if (window.BN.PARAMS.get('cu') === '1') import('./legacy.js');
else import('./Customer.jsx');
