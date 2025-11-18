// 测试登录 API
const testLogin = async () => {
  try {
    // 使用 Vercel CLI 的本地开发端口
    const response = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'patchx',
        password: 'patchx'
      }),
    })

    console.log('响应状态:', response.status)
    console.log('响应头:', response.headers)

    const text = await response.text()
    console.log('原始响应文本:', text)

    if (response.ok) {
      const data = JSON.parse(text)
      console.log('✅ 登录成功!')
      console.log('用户:', data.user)
      console.log('令牌:', data.token)
    } else {
      console.log('❌ 登录失败，状态码:', response.status)
    }
  } catch (error) {
    console.error('❌ 请求错误:', error)
  }
}

// 测试错误凭据
const testInvalidLogin = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'wrong',
        password: 'wrong'
      }),
    })

    const text = await response.text()
    console.log('错误凭据测试原始响应:', text)

    if (!response.ok) {
      try {
        const data = JSON.parse(text)
        console.log('✅ 错误凭据被拒绝:', data.message)
      } catch {
        console.log('✅ 错误凭据被拒绝，状态码:', response.status)
      }
    }
  } catch (error) {
    console.error('❌ 请求错误:', error)
  }
}

console.log('开始测试登录功能...')
setTimeout(() => {
  testLogin()
  setTimeout(() => {
    testInvalidLogin()
  }, 1000)
}, 1000)