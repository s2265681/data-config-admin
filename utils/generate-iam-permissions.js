const fs = require('fs');
const path = require('path');

function generateIamPermissions() {
  try {
    console.log('🔧 动态生成IAM权限配置...');
    
    // 读取文件夹配置
    const configPath = path.join(process.cwd(), 'config', 'folders.json');
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    // 生成S3资源ARN列表
    const s3Resources = [];
    
    config.folders.forEach(folder => {
      if (folder.s3_prefix_staging) {
        s3Resources.push(`arn:aws:s3:::rock-service-data/${folder.s3_prefix_staging}/*`);
      }
      if (folder.s3_prefix_production) {
        s3Resources.push(`arn:aws:s3:::rock-service-data/${folder.s3_prefix_production}/*`);
      }
    });
    
    console.log(`📋 生成 ${s3Resources.length} 个S3资源权限`);
    s3Resources.forEach(resource => {
      console.log(`   ${resource}`);
    });
    
    return s3Resources;
    
  } catch (error) {
    console.error('❌ 生成IAM权限配置失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const resources = generateIamPermissions();
  console.log('\n📝 生成的IAM权限配置:');
  console.log(JSON.stringify(resources, null, 2));
}

module.exports = { generateIamPermissions }; 