const fs = require('fs');
const path = require('path');

class ConfigManager {
  constructor() {
    this.configPath = path.join(process.cwd(), 'config', 'files.json');
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      const configContent = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(configContent);
    } catch (error) {
      console.error('加载配置文件失败:', error);
      throw error;
    }
  }

  // 获取所有文件配置
  getFiles() {
    return this.config.files || [];
  }

  // 获取环境配置
  getEnvironments() {
    return this.config.environments || {};
  }

  // 获取监控配置
  getMonitoringConfig() {
    return this.config.monitoring || {};
  }

  // 获取S3监控路径
  getS3MonitoringPaths() {
    const monitoring = this.getMonitoringConfig();
    return monitoring.s3_paths || [];
  }

  // 根据S3路径获取文件配置
  getFileByS3Path(s3Key) {
    const files = this.getFiles();
    
    for (const file of files) {
      if (file.staging_path === s3Key || file.production_path === s3Key) {
        return file;
      }
    }
    
    return null;
  }

  // 根据环境获取文件列表
  getFilesByEnvironment(environment) {
    const files = this.getFiles();
    const envFiles = [];
    
    for (const file of files) {
      const pathKey = environment === 'production' ? 'production_path' : 'staging_path';
      if (file[pathKey]) {
        envFiles.push({
          ...file,
          s3_path: file[pathKey]
        });
      }
    }
    
    return envFiles;
  }

  // 验证配置
  validateConfig() {
    const errors = [];
    
    // 检查文件配置
    const files = this.getFiles();
    if (!files || files.length === 0) {
      errors.push('没有配置任何文件');
    }
    
    for (const file of files) {
      if (!file.name) {
        errors.push('文件配置缺少name字段');
      }
      if (!file.staging_path) {
        errors.push(`文件 ${file.name} 缺少staging_path配置`);
      }
      if (!file.production_path) {
        errors.push(`文件 ${file.name} 缺少production_path配置`);
      }
    }
    
    // 检查环境配置
    const environments = this.getEnvironments();
    if (!environments.staging) {
      errors.push('缺少staging环境配置');
    }
    if (!environments.production) {
      errors.push('缺少production环境配置');
    }
    
    // 检查监控配置
    const monitoring = this.getMonitoringConfig();
    if (!monitoring.s3_paths || monitoring.s3_paths.length === 0) {
      errors.push('缺少S3监控路径配置');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // 生成监控路径摘要
  generateMonitoringSummary() {
    const monitoring = this.getMonitoringConfig();
    const paths = monitoring.s3_paths || [];
    
    console.log('📋 S3监控路径配置:');
    console.log('==================');
    
    paths.forEach((path, index) => {
      console.log(`${index + 1}. ${path.prefix}*.json (${path.environment})`);
    });
    
    console.log('');
    console.log('📁 文件配置:');
    console.log('============');
    
    const files = this.getFiles();
    files.forEach((file, index) => {
      console.log(`${index + 1}. ${file.name}`);
      console.log(`   Staging: ${file.staging_path}`);
      console.log(`   Production: ${file.production_path}`);
    });
  }

  // 检查S3路径是否在监控范围内
  isPathMonitored(s3Key) {
    const monitoringPaths = this.getS3MonitoringPaths();
    
    for (const path of monitoringPaths) {
      if (s3Key.startsWith(path.prefix) && s3Key.endsWith(path.suffix)) {
        return {
          monitored: true,
          environment: path.environment,
          prefix: path.prefix
        };
      }
    }
    
    return { monitored: false };
  }

  // 获取所有监控的S3路径前缀
  getAllMonitoredPrefixes() {
    const monitoringPaths = this.getS3MonitoringPaths();
    return monitoringPaths.map(path => path.prefix);
  }

  // 重新加载配置
  reload() {
    this.config = this.loadConfig();
    return this.config;
  }
}

module.exports = ConfigManager; 