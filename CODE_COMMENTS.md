# Data Config Admin - 代码注释说明

## 📝 核心代码文件详细注释

### 1. 配置文件管理 (`config/folders.json`)

```json
{
  "folders": [
    {
      "name": "config",                    // 文件夹标识名称，用于程序内部引用
      "description": "主要配置文件",        // 人类可读的描述信息
      
      // 本地文件路径配置 - 决定GitHub中的文件位置
      "local_path_staging": "app-config/config/staging",      // Staging环境在GitHub中的路径
      "local_path_production": "app-config/config/production", // Production环境在GitHub中的路径
      
      // S3路径配置 - 决定S3中的文件位置（当前主要用于权限配置）
      "s3_prefix_staging": "config/staging",                  // Staging环境在S3中的前缀
      "s3_prefix_production": "config/production",            // Production环境在S3中的前缀
      
      "files": [                          // 该文件夹下需要监控的文件列表
        {
          "name": "test.json",            // 文件名（必须包含扩展名）
          "description": "主要配置文件"    // 文件用途描述
        }
      ]
    }
  ],
  
  "environments": {                       // 环境配置信息
    "staging": {
      "github_branch": "staging"          // Staging环境对应的GitHub分支
    },
    "production": {
      "github_branch": "main"             // Production环境对应的GitHub分支
    }
  }
}
```

### 2. 文件夹管理器 (`utils/folder-manager.js`)

```javascript
class FolderManager {
  constructor() {
    // 配置文件路径，支持Lambda环境
    this.foldersConfigPath = path.join(process.cwd(), 'config', 'folders.json');
    this.foldersConfig = this.loadFoldersConfig();
    
    // Lambda环境中使用/tmp目录作为可写目录
    this.basePath = process.env.AWS_LAMBDA_FUNCTION_NAME ? '/tmp' : process.cwd();
  }

  // 加载并解析配置文件
  loadFoldersConfig() {
    try {
      const configContent = fs.readFileSync(this.foldersConfigPath, 'utf8');
      return JSON.parse(configContent);
    } catch (error) {
      throw new Error(`无法加载文件夹配置: ${error.message}`);
    }
  }

  // 验证配置文件的完整性和正确性
  validateFoldersConfig() {
    const errors = [];
    const warnings = [];
    
    // 检查基本结构
    if (!this.foldersConfig.folders || !Array.isArray(this.foldersConfig.folders)) {
      errors.push('配置缺少folders数组');
      return { isValid: false, errors, warnings };
    }
    
    // 验证每个文件夹配置
    this.foldersConfig.folders.forEach((folder, index) => {
      // 检查必需字段
      if (!folder.name) {
        errors.push(`文件夹 ${index}: 缺少name字段`);
      }
      
      // 检查路径配置
      if (!folder.local_path_staging && !folder.local_path_production) {
        errors.push(`文件夹 ${folder.name}: 至少需要配置一个环境的本地路径`);
      }
      
      // 检查文件列表
      if (!folder.files || !Array.isArray(folder.files)) {
        errors.push(`文件夹 ${folder.name}: 缺少files数组`);
      }
    });
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  // 获取文件哈希值（用于判断文件是否变更）
  getFileHash(folderName, fileName) {
    const filePath = this.getFilePath(folderName, fileName);
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  // 检查文件是否存在
  fileExists(folderName, fileName) {
    const filePath = this.getFilePath(folderName, fileName);
    return fs.existsSync(filePath);
  }
}
```

### 3. Lambda函数处理器 (`handlers/s3-to-github.js`)

```javascript
exports.handler = async (event) => {
  console.log('S3到GitHub同步事件触发:', JSON.stringify(event, null, 2));
  
  try {
    const folderManager = new FolderManager();
    
    // 验证配置文件的正确性
    const validation = folderManager.validateFoldersConfig();
    if (!validation.isValid) {
      console.error('配置验证失败:', validation.errors);
      throw new Error('配置验证失败');
    }
    
    // 处理每个S3事件记录
    for (const record of event.Records) {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
      const eventName = record.eventName;
      
      console.log(`处理S3事件: ${eventName}, Bucket: ${bucket}, Key: ${key}`);
      
      // 检查S3路径是否在监控范围内
      const pathInfo = isPathMonitored(key, folderManager);
      if (!pathInfo.monitored) {
        console.log(`跳过非监控路径: ${key}`);
        continue;
      }
      
      // 提取文件信息和文件夹配置
      const fileInfo = extractFileInfo(key, folderManager);
      if (!fileInfo) {
        console.log('跳过非配置文件:', key);
        continue;
      }
      
      // 根据事件类型执行相应操作
      if (eventName.startsWith('ObjectCreated') || eventName.startsWith('ObjectModified')) {
        await syncS3ToGithub(bucket, key, fileInfo, pathInfo, folderManager);
      } else if (eventName.startsWith('ObjectRemoved')) {
        await removeFromGithub(fileInfo, pathInfo, folderManager);
      }
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'S3到GitHub同步完成' })
    };
  } catch (error) {
    console.error('S3到GitHub同步失败:', error);
    throw error;
  }
};

// 检查S3路径是否在监控范围内
function isPathMonitored(s3Key, folderManager) {
  const parts = s3Key.split('/');
  if (parts.length < 3) {
    return { monitored: false };
  }
  
  const s3Prefix = parts[0];        // 例如: "config"
  const environment = parts[1];     // 例如: "staging" 或 "production"
  const fileName = parts[2];        // 例如: "test.json"
  
  // 检查是否是JSON文件
  if (!fileName || !fileName.endsWith('.json')) {
    return { monitored: false };
  }
  
  // 根据S3前缀找到对应的文件夹配置
  const folder = folderManager.getFolders().find(f => {
    const stagingPrefix = f.s3_prefix_staging;
    const productionPrefix = f.s3_prefix_production;
    
    // 提取基础前缀（去掉环境部分）
    const stagingBase = stagingPrefix ? stagingPrefix.split('/')[0] : null;
    const productionBase = productionPrefix ? productionPrefix.split('/')[0] : null;
    
    return stagingBase === s3Prefix || productionBase === s3Prefix;
  });
  
  if (!folder) {
    console.log(`未找到对应的文件夹配置: ${s3Prefix}`);
    return { monitored: false };
  }
  
  // 检查文件是否在文件夹配置中
  const fileConfig = folder.files.find(f => f.name === fileName);
  if (!fileConfig) {
    console.log(`文件 ${fileName} 不在文件夹 ${folder.name} 的配置中`);
    return { monitored: false };
  }
  
  return {
    monitored: true,
    environment: environment,
    prefix: `${s3Prefix}/${environment}/`,
    folder: folder
  };
}

// 同步S3文件到GitHub
async function syncS3ToGithub(bucket, key, fileInfo, pathInfo, folderManager) {
  try {
    console.log(`🔄 开始同步文件到GitHub: ${fileInfo.fileName}`);
    
    // 从S3获取文件内容
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });
    
    const s3Response = await s3Client.send(getObjectCommand);
    const fileContent = await streamToString(s3Response.Body);
    
    // 获取环境信息
    const environment = pathInfo.environment;
    const branch = environment === 'production' ? 'main' : 'staging';
    
    // 获取GitHub仓库信息
    const [owner, repo] = process.env.GITHUB_REPO.split('/');
    
    // 构建GitHub文件路径 - 关键：使用local_path配置
    let githubFilePath;
    if (environment === 'staging' && fileInfo.folder.local_path_staging) {
      githubFilePath = `${fileInfo.folder.local_path_staging}/${fileInfo.fileName}`;
    } else if (environment === 'production' && fileInfo.folder.local_path_production) {
      githubFilePath = `${fileInfo.folder.local_path_production}/${fileInfo.fileName}`;
    } else {
      throw new Error(`文件夹 ${fileInfo.folderName} 未配置 ${environment} 环境的本地路径`);
    }
    
    // 检查文件是否已存在
    let currentFile = null;
    try {
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: githubFilePath,
        ref: branch
      });
      currentFile = response.data;
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
    }
    
    // 计算文件内容的SHA（用于判断内容是否变更）
    const contentBuffer = Buffer.from(fileContent, 'utf8');
    const sha = crypto.createHash('sha1').update(contentBuffer).digest('hex');
    
    // 如果文件内容没有变化，跳过更新
    if (currentFile && currentFile.sha === sha) {
      console.log(`⏭️  ${fileInfo.fileName} 内容未变化，跳过GitHub更新`);
      return;
    }
    
    // 生成提交信息
    const commitMessage = `🔄 从S3同步: ${fileInfo.fileName} (${environment})`;
    
    // 更新GitHub文件
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: githubFilePath,
      message: commitMessage,
      content: contentBuffer.toString('base64'),
      branch: branch,
      sha: currentFile ? currentFile.sha : undefined
    });
    
    console.log(`✅ 成功同步 ${fileInfo.fileName} 到GitHub ${branch}分支`);
    
  } catch (error) {
    console.error(`❌ 同步 ${fileInfo.fileName} 到GitHub失败:`, error);
    throw error;
  }
}
```

### 4. 动态S3事件插件 (`plugins/dynamic-s3-events.js`)

```javascript
class DynamicS3EventsPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    
    // 注册Serverless Framework钩子
    this.hooks = {
      'before:package:initialize': this.generateS3Events.bind(this),
      'before:deploy:initialize': this.generateS3Events.bind(this)
    };
  }

  generateS3Events() {
    try {
      console.log('🔄 动态生成S3事件配置...');
      
      // 读取文件夹配置文件
      const configPath = path.join(process.cwd(), 'config', 'folders.json');
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configContent);
      
      // 生成监控路径配置
      let monitoringPaths = this.generateMonitoringPaths(config);
      
      // 去除重叠前缀，避免冲突
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
    // 使用通用的监控规则，避免AWS S3事件通知冲突
    // 具体的路径过滤逻辑在Lambda函数内部实现
    return [
      {
        prefix: '',           // 监控所有路径
        suffix: '.json',      // 只监控JSON文件
        environment: 'all'    // 监控所有环境
      }
    ];
  }

  generateS3EventConfig(monitoringPaths) {
    const events = [];
    
    monitoringPaths.forEach((path, index) => {
      // 为每个路径生成创建和删除事件
      const createEvent = {
        s3: {
          bucket: 'rock-service-data',
          event: 's3:ObjectCreated:*',    // 文件创建事件
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
          event: 's3:ObjectRemoved:*',    // 文件删除事件
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
    
    // 找到s3ToGithubSync函数并更新其事件配置
    const functionName = 's3ToGithubSync';
    if (service.functions[functionName]) {
      service.functions[functionName].events = s3Events;
      
      console.log(`📝 更新函数 ${functionName} 的事件配置`);
      console.log(`📋 监控路径:`);
      s3Events.forEach((event, index) => {
        const s3Config = event.s3;
        const prefix = s3Config.rules.find(r => r.prefix)?.prefix || '';
        const eventType = s3Config.event;
        console.log(`   ${index + 1}. ${prefix}*.json (${eventType})`);
      });
    } else {
      console.log(`⚠️  未找到函数 ${functionName}`);
    }
  }
}
```

### 5. 同步脚本 (`scripts/sync-folders-to-s3.js`)

```javascript
async function syncFoldersToS3() {
  try {
    const folderManager = new FolderManager();
    const bucket = process.env.S3_BUCKET || 'rock-service-data';
    
    // 根据GitHub分支或环境变量确定环境
    let environment = process.env.ENVIRONMENT;
    if (!environment) {
      // 从GitHub分支判断环境
      const githubRef = process.env.GITHUB_REF || '';
      if (githubRef.includes('main') || githubRef.includes('master')) {
        environment = 'production';
      } else {
        environment = 'staging';
      }
    }
    
    const syncSource = process.env.SYNC_SOURCE || `github-${environment}`;
    
    console.log(`🚀 开始基于文件夹的智能同步到S3: ${bucket}`);
    console.log(`📁 环境: ${environment}`);
    console.log(`🌍 区域: ${process.env.AWS_REGION || 'ap-southeast-2'}`);
    console.log(`🔄 同步来源: ${syncSource}`);
    
    const folders = folderManager.getFolders();
    const results = {
      success: [],
      failed: [],
      skipped: []
    };
    
    // 遍历每个文件夹
    for (const folder of folders) {
      console.log(`\n📁 处理文件夹: ${folder.name} (${folder.description})`);
      
      // 根据环境确定本地路径
      let localPath;
      let s3Prefix;
      
      if (environment === 'staging') {
        localPath = folder.local_path_staging;
        s3Prefix = folder.s3_prefix_staging;
      } else if (environment === 'production') {
        localPath = folder.local_path_production;
        s3Prefix = folder.s3_prefix_production;
      } else {
        console.log(`   ⚠️  跳过未知环境: ${environment}`);
        continue;
      }
      
      if (!localPath || !s3Prefix) {
        console.log(`   ⚠️  文件夹 ${folder.name} 未配置 ${environment} 环境路径`);
        continue;
      }
      
      console.log(`   📂 本地路径: ${localPath}`);
      console.log(`   ☁️  S3前缀: ${s3Prefix}`);
      
      // 处理文件夹中的每个文件
      for (const file of folder.files) {
        const fileName = file.name;
        console.log(`   📄 处理文件: ${fileName}`);
        
        // 构建文件路径
        const localFilePath = path.join(process.cwd(), localPath, fileName);
        const s3Key = `${s3Prefix}/${fileName}`;
        
        // 检查本地文件是否存在
        if (!fs.existsSync(localFilePath)) {
          console.log(`      ⚠️  本地文件不存在: ${localFilePath}`);
          results.failed.push({
            folder: folder.name,
            file: fileName,
            reason: '本地文件不存在',
            path: localFilePath
          });
          continue;
        }
        
        // 读取本地文件内容
        const fileContent = fs.readFileSync(localFilePath, 'utf8');
        const localHash = crypto.createHash('sha256').update(fileContent).digest('hex');
        
        console.log(`      📄 本地文件大小: ${fileContent.length} 字节`);
        console.log(`      🔐 本地文件哈希: ${localHash.substring(0, 8)}...`);
        
        // 检查S3文件状态
        let s3Exists = false;
        let s3Hash = null;
        
        try {
          const headCommand = new HeadObjectCommand({
            Bucket: bucket,
            Key: s3Key
          });
          const headResult = await s3Client.send(headCommand);
          s3Exists = true;
          s3Hash = headResult.Metadata?.['file-hash'];
          console.log(`      ☁️  S3文件存在，哈希: ${s3Hash ? s3Hash.substring(0, 8) + '...' : '无'}`);
        } catch (error) {
          if (error.name === 'NotFound') {
            console.log(`      ☁️  S3文件不存在，需要上传`);
          } else {
            throw error;
          }
        }
        
        // 比较哈希，判断是否需要同步
        if (s3Exists && s3Hash === localHash) {
          console.log(`      ⏭️  文件未变更，跳过同步`);
          results.skipped.push({
            folder: folder.name,
            file: fileName,
            reason: '文件未变更',
            hash: localHash.substring(0, 8) + '...'
          });
          continue;
        }
        
        // 上传到S3
        const putObjectCommand = new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: fileContent,
          ContentType: 'application/json',
          Metadata: {
            'synced-from': syncSource,
            'synced-at': new Date().toISOString(),
            'commit-sha': process.env.GITHUB_SHA || 'unknown',
            'environment': environment,
            'file-hash': localHash,
            'source-folder': folder.name,
            'source-file': fileName,
            'sync-direction': 'github-to-s3'
          }
        });
        
        await s3Client.send(putObjectCommand);
        
        console.log(`      ✅ 成功同步: ${fileName}`);
        results.success.push({
          folder: folder.name,
          file: fileName,
          s3Key: s3Key,
          size: fileContent.length,
          hash: localHash.substring(0, 8) + '...',
          changed: s3Exists ? '更新' : '新增'
        });
      }
    }
    
    // 输出同步结果
    console.log('\n📊 同步结果汇总:');
    console.log('================');
    console.log(`✅ 成功: ${results.success.length} 个文件`);
    console.log(`⏭️  跳过: ${results.skipped.length} 个文件`);
    console.log(`❌ 失败: ${results.failed.length} 个文件`);
    
    if (results.success.length > 0) {
      console.log('\n✅ 成功同步的文件:');
      results.success.forEach(item => {
        console.log(`   📄 ${item.folder}/${item.file} → ${item.s3Key} (${item.changed})`);
      });
    }
    
    if (results.failed.length > 0) {
      console.log('\n❌ 同步失败的文件:');
      results.failed.forEach(item => {
        console.log(`   📄 ${item.folder}/${item.file}: ${item.reason}`);
      });
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ 同步到S3失败:', error);
    throw error;
  }
}
```

### 6. S3 ARN生成器 (`utils/generate-s3-arns.js`)

```javascript
function generateS3Arns() {
  try {
    // 读取文件夹配置文件
    const configPath = path.join(process.cwd(), 'config', 'folders.json');
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    const bucket = 'rock-service-data';
    const arns = [];
    
    // 从文件夹配置生成ARN
    if (config.folders) {
      config.folders.forEach(folder => {
        // 为每个文件夹的staging和production环境生成ARN
        // 这些ARN用于Lambda函数的IAM权限配置
        if (folder.s3_prefix_staging) {
          arns.push(`arn:aws:s3:::${bucket}/${folder.s3_prefix_staging}/*`);
        }
        if (folder.s3_prefix_production) {
          arns.push(`arn:aws:s3:::${bucket}/${folder.s3_prefix_production}/*`);
        }
      });
    }
    
    return JSON.stringify(arns);
    
  } catch (error) {
    console.error('生成S3 ARN失败:', error);
    // 返回默认ARN作为后备
    return JSON.stringify([
      'arn:aws:s3:::rock-service-data/config/staging/*',
      'arn:aws:s3:::rock-service-data/config/production/*',
      'arn:aws:s3:::rock-service-data/config2/staging/*',
      'arn:aws:s3:::rock-service-data/config2/production/*',
      'arn:aws:s3:::rock-service-data/config3/staging/*',
      'arn:aws:s3:::rock-service-data/config3/production/*'
    ]);
  }
}
```

## 🔑 关键设计模式

### 1. 配置驱动设计
- 所有文件路径和监控规则都通过 `config/folders.json` 配置
- 支持动态添加新的文件夹和文件监控
- 无需修改代码即可扩展监控范围

### 2. 环境分离
- Staging和Production环境完全分离
- 不同的GitHub分支对应不同环境
- 独立的S3路径和本地路径配置

### 3. 智能同步
- 基于文件哈希值判断是否需要同步
- 避免不必要的文件传输
- 详细的同步状态报告

### 4. 错误处理
- 完善的错误捕获和日志记录
- 配置验证确保系统稳定性
- 优雅的失败处理机制

### 5. 自动化部署
- GitHub Actions自动触发部署
- Serverless Framework简化云资源管理
- 动态生成S3事件配置

## 📋 配置最佳实践

### 1. 文件夹命名
- 使用有意义的名称，如 `config`, `config2`, `config3`
- 避免使用特殊字符和空格

### 2. 文件路径配置
- `local_path_staging` 和 `local_path_production` 决定GitHub中的文件位置
- 路径应该与实际的文件夹结构一致

### 3. S3前缀配置
- `s3_prefix_staging` 和 `s3_prefix_production` 决定S3中的文件位置
- 建议使用与文件夹名称一致的前缀

### 4. 文件监控
- 只监控必要的JSON配置文件
- 为每个文件提供清晰的描述
- 定期清理不再需要的文件配置

---

*最后更新: 2024年12月* 