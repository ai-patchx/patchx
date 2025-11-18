// 简单的环境变量测试
console.log('=== 环境变量配置测试 ===')

// 测试 Node.js 环境变量
console.log('1. Node.js process.env:')
console.log('   TEST_USER_PASSWORD:', process.env.TEST_USER_PASSWORD || '未设置')

console.log('\n2. 实际使用的密码:')
const password = process.env.TEST_USER_PASSWORD || 'patchx'
console.log('   当前密码:', password)
console.log('   是否使用默认密码:', password === 'patchx' ? '是' : '否')

console.log('\n=== 测试建议 ===')
console.log('1. 本地开发: 创建 .env.local 文件设置 TEST_USER_PASSWORD')
console.log('2. Vercel: 在控制台设置 TEST_USER_PASSWORD 环境变量')
console.log('3. Cloudflare: 在 Workers 设置中配置 TEST_USER_PASSWORD')
console.log('4. 测试: 使用 npm run dev:env 启动开发服务器测试自定义密码')