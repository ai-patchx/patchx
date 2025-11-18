// 测试环境变量配置
console.log('=== 环境变量配置测试 ===')

// 测试不同方式读取环境变量
const testEnvironments = () => {
  console.log('1. Node.js process.env:')
  console.log('   TEST_USER_PASSWORD:', process.env.TEST_USER_PASSWORD || '未设置')

  console.log('\n2. Vite import.meta.env:')
  try {
    console.log('   TEST_USER_PASSWORD:', typeof import.meta !== 'undefined' ? (import.meta && import.meta.env && import.meta.env.TEST_USER_PASSWORD) || '未设置' : 'Node.js 环境不可用')
  } catch {
    console.log('   TEST_USER_PASSWORD: Node.js 环境不可用')
  }

  console.log('\n3. Cloudflare Workers 全局变量:')
  console.log('   TEST_USER_PASSWORD:', globalThis && globalThis.TEST_USER_PASSWORD || '未设置')

  console.log('\n4. 实际使用的密码:')
  const getTestPassword = () => {
    if (process.env.TEST_USER_PASSWORD) {
      return process.env.TEST_USER_PASSWORD
    }
    if (globalThis && globalThis.TEST_USER_PASSWORD) {
      return globalThis.TEST_USER_PASSWORD
    }
    if (typeof import.meta !== 'undefined' && import.meta && import.meta.env?.TEST_USER_PASSWORD) {
      return import.meta.env.TEST_USER_PASSWORD
    }
    return 'patchx'
  }

  const password = getTestPassword()
  console.log('   当前密码:', password)
  console.log('   是否使用默认密码:', password === 'patchx' ? '是' : '否')
}

testEnvironments()

console.log('\n=== 测试建议 ===')
console.log('1. 本地开发: 创建 .env.local 文件设置 TEST_USER_PASSWORD')
console.log('2. Vercel: 在控制台设置 TEST_USER_PASSWORD 环境变量')
console.log('3. Cloudflare: 在 Workers 设置中配置 TEST_USER_PASSWORD')
console.log('4. 测试: 使用 npm run dev:env 启动开发服务器测试自定义密码')