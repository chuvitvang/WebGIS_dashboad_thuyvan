const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

const configContent = `const CONFIG = {
    SUPABASE_URL: '${supabaseUrl}',
    SUPABASE_ANON_KEY: '${supabaseAnonKey}'
};
`;

const configDir = path.join(__dirname, 'assets', 'js');
if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
}

fs.writeFileSync(path.join(configDir, 'config.js'), configContent, 'utf8');
console.log("Đã tạo tệp assets/js/config.js từ Biến môi trường thành công!");
