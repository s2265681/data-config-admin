const fs = require('fs');
const path = require('path');

class DynamicS3EventsPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.hooks = {
      'before:package:initialize': this.generateS3Events.bind(this),
      'before:deploy:initialize': this.generateS3Events.bind(this)
    };
  }

  generateS3Events() {
    try {
      console.log('🔄 动态生成S3事件配置...');
      
      // 读取配置文件
      const configPath = path.join(process.cwd(), 'config', 'files.json');
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configContent);
      
      const monitoringPaths = config.monitoring?.s3_paths || [];
      
      if (monitoringPaths.length === 0) {
        console.log('⚠️  没有找到监控路径配置');
        return;
      }
      
      // 生成S3事件配置
      const s3Events = this.generateS3EventConfig(monitoringPaths);
      
      // 更新serverless配置
      this.updateServerlessConfig(s3Events);
      
      console.log(`✅ 成功生成 ${s3Events.length} 个S3事件规则`);
      
    } catch (error) {
      console.error('❌ 生成S3事件配置失败:', error);
      throw error;
    }
  }

  generateS3EventConfig(monitoringPaths) {
    const events = [];
    
    monitoringPaths.forEach(path => {
      // 为每个路径生成创建和删除事件
      const createEvent = {
        s3: {
          bucket: 'rock-service-data',
          event: 's3:ObjectCreated:*',
          rules: [
            { prefix: path.prefix },
            { suffix: path.suffix }
          ],
          existing: true
        }
      };
      
      const removeEvent = {
        s3: {
          bucket: 'rock-service-data',
          event: 's3:ObjectRemoved:*',
          rules: [
            { prefix: path.prefix },
            { suffix: path.suffix }
          ],
          existing: true
        }
      };
      
      events.push(createEvent, removeEvent);
    });
    
    return events;
  }

  updateServerlessConfig(s3Events) {
    const service = this.serverless.service;
    
    // 找到s3ToGithubMultiSync函数
    const functionName = 's3ToGithubMultiSync';
    if (service.functions[functionName]) {
      // 替换现有的事件配置
      service.functions[functionName].events = s3Events;
      
      console.log(`📝 更新函数 ${functionName} 的事件配置`);
      console.log(`📋 监控路径:`);
      s3Events.forEach((event, index) => {
        const s3Config = event.s3;
        const prefix = s3Config.rules.find(r => r.prefix)?.prefix;
        const eventType = s3Config.event;
        console.log(`   ${index + 1}. ${prefix}*.json (${eventType})`);
      });
    } else {
      console.log(`⚠️  未找到函数 ${functionName}`);
    }
  }
}

module.exports = DynamicS3EventsPlugin; 