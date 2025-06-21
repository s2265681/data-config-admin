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
      
      // 读取新的文件夹配置
      const configPath = path.join(process.cwd(), 'config', 'folders.json');
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configContent);
      
      // 从文件夹配置生成监控路径
      let monitoringPaths = this.generateMonitoringPaths(config);
      // 去除重叠前缀
      monitoringPaths = this.filterOverlappingPaths(monitoringPaths);
      
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

  generateMonitoringPaths(config) {
    const paths = [];
    const pathSet = new Set(); // 用于去重
    
    // 从文件夹配置生成路径
    if (config.folders) {
      config.folders.forEach(folder => {
        // 为每个文件夹的staging和production环境生成路径
        const stagingPath = {
          prefix: `${folder.s3_prefix}/staging/`,
          suffix: '.json',
          environment: 'staging'
        };
        const productionPath = {
          prefix: `${folder.s3_prefix}/production/`,
          suffix: '.json',
          environment: 'production'
        };
        
        // 检查是否已存在，避免重复
        const stagingKey = `${stagingPath.prefix}${stagingPath.suffix}`;
        const productionKey = `${productionPath.prefix}${productionPath.suffix}`;
        
        if (!pathSet.has(stagingKey)) {
          paths.push(stagingPath);
          pathSet.add(stagingKey);
        }
        
        if (!pathSet.has(productionKey)) {
          paths.push(productionPath);
          pathSet.add(productionKey);
        }
      });
    }
    
    // 如果配置中有monitoring部分，也使用它（但要避免重复）
    if (config.monitoring?.s3_paths) {
      config.monitoring.s3_paths.forEach(path => {
        const pathKey = `${path.prefix}${path.suffix}`;
        if (!pathSet.has(pathKey)) {
          paths.push(path);
          pathSet.add(pathKey);
        }
      });
    }
    
    return paths;
  }

  // 过滤掉有重叠前缀的路径，只保留最具体的
  filterOverlappingPaths(paths) {
    // 按前缀长度降序排序，优先保留更具体的
    const sorted = [...paths].sort((a, b) => b.prefix.length - a.prefix.length);
    const result = [];
    for (const path of sorted) {
      if (!result.some(p => p.suffix === path.suffix && p.prefix.startsWith(path.prefix))) {
        result.push(path);
      }
    }
    // 按原顺序返回
    return result.reverse();
  }

  generateS3EventConfig(monitoringPaths) {
    const events = [];
    
    monitoringPaths.forEach((path, index) => {
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
    
    // 找到s3ToLocalFoldersSync函数
    const functionName = 's3ToLocalFoldersSync';
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