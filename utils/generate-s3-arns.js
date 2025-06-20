const fs = require('fs');
const path = require('path');

function generateS3Arns() {
  try {
    // 读取配置文件
    const configPath = path.join(process.cwd(), 'config', 'files.json');
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    const monitoringPaths = config.monitoring?.s3_paths || [];
    const bucket = 'rock-service-data';
    
    // 生成S3资源ARN
    const arns = monitoringPaths.map(path => {
      return `arn:aws:s3:::${bucket}/${path.prefix}*`;
    });
    
    // 返回JSON字符串格式的ARN数组
    return JSON.stringify(arns);
    
  } catch (error) {
    console.error('生成S3 ARN失败:', error);
    // 返回默认ARN
    return JSON.stringify([
      'arn:aws:s3:::rock-service-data/config/staging/*',
      'arn:aws:s3:::rock-service-data/config/production/*',
      'arn:aws:s3:::rock-service-data/config2/staging/*',
      'arn:aws:s3:::rock-service-data/config2/production/*'
    ]);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  console.log(generateS3Arns());
} else {
  // 作为模块导出
  module.exports = generateS3Arns();
} 