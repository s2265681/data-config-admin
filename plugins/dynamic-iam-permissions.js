const { generateIamPermissions } = require('../utils/generate-iam-permissions');

class DynamicIamPermissionsPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.hooks = {
      'before:package:initialize': this.updateIamPermissions.bind(this),
      'before:deploy:initialize': this.updateIamPermissions.bind(this)
    };
  }

  updateIamPermissions() {
    try {
      console.log('🔧 动态更新IAM权限配置...');
      
      // 生成S3资源权限列表
      const s3Resources = generateIamPermissions();
      
      // 更新serverless配置中的IAM权限
      this.updateServerlessIamConfig(s3Resources);
      
      console.log('✅ IAM权限配置更新完成');
      
    } catch (error) {
      console.error('❌ 更新IAM权限配置失败:', error);
      throw error;
    }
  }

  updateServerlessIamConfig(s3Resources) {
    const service = this.serverless.service;
    
    // 确保provider.iam.role.statements存在
    if (!service.provider.iam) {
      service.provider.iam = {};
    }
    if (!service.provider.iam.role) {
      service.provider.iam.role = {};
    }
    if (!service.provider.iam.role.statements) {
      service.provider.iam.role.statements = [];
    }
    
    // 查找S3权限语句
    let s3Statement = service.provider.iam.role.statements.find(
      statement => statement.Effect === 'Allow' && 
      statement.Action && 
      statement.Action.includes('s3:GetObject')
    );
    
    if (!s3Statement) {
      // 如果不存在S3权限语句，创建一个新的
      s3Statement = {
        Effect: 'Allow',
        Action: [
          's3:GetObject',
          's3:PutObject',
          's3:DeleteObject'
        ],
        Resource: []
      };
      service.provider.iam.role.statements.push(s3Statement);
    }
    
    // 更新S3资源权限
    s3Statement.Resource = s3Resources;
    
    console.log(`📝 更新了 ${s3Resources.length} 个S3资源权限`);
    
    // 确保CloudWatch Logs权限存在
    const logsStatement = service.provider.iam.role.statements.find(
      statement => statement.Effect === 'Allow' && 
      statement.Action && 
      statement.Action.includes('logs:CreateLogGroup')
    );
    
    if (!logsStatement) {
      service.provider.iam.role.statements.push({
        Effect: 'Allow',
        Action: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'logs:DeleteLogGroup'
        ],
        Resource: '*'
      });
    }
  }
}

module.exports = DynamicIamPermissionsPlugin; 