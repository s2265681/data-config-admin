const { syncToS3 } = require('../scripts/sync-to-s3');
const { syncToGithub } = require('../scripts/sync-to-github');
const fs = require('fs');
const path = require('path');

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  HeadObjectCommand: jest.fn()
}));

// Mock Octokit
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    repos: {
      getContent: jest.fn(),
      createOrUpdateFileContents: jest.fn(),
      deleteFile: jest.fn()
    }
  }))
}));

describe('同步功能测试', () => {
  const testFilePath = path.join(__dirname, '../test.json');
  
  beforeEach(() => {
    // 创建测试文件
    const testData = {
      data: {
        name: "Test User",
        age: 25,
        city: "Test City"
      }
    };
    fs.writeFileSync(testFilePath, JSON.stringify(testData, null, 2));
  });
  
  afterEach(() => {
    // 清理测试文件
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });
  
  test('应该能够同步到S3', async () => {
    const mockSend = jest.fn().mockResolvedValue({
      ContentLength: 100,
      LastModified: new Date()
    });
    
    const { S3Client } = require('@aws-sdk/client-s3');
    S3Client.mockImplementation(() => ({
      send: mockSend
    }));
    
    process.env.S3_BUCKET = 'test-bucket';
    process.env.S3_KEY = 'test/path/test.json';
    
    await syncToS3();
    
    expect(mockSend).toHaveBeenCalled();
  });
  
  test('应该能够同步到GitHub', async () => {
    const mockGetContent = jest.fn().mockRejectedValue({ status: 404 });
    const mockCreateOrUpdate = jest.fn().mockResolvedValue({});
    
    const { Octokit } = require('@octokit/rest');
    Octokit.mockImplementation(() => ({
      repos: {
        getContent: mockGetContent,
        createOrUpdateFileContents: mockCreateOrUpdate,
        deleteFile: jest.fn()
      }
    }));
    
    process.env.GITHUB_REPO = 'test/repo';
    process.env.S3_BUCKET = 'test-bucket';
    
    // Mock S3 response
    const { S3Client } = require('@aws-sdk/client-s3');
    S3Client.mockImplementation(() => ({
      send: jest.fn().mockResolvedValue({
        Body: {
          on: jest.fn(),
          pipe: jest.fn()
        }
      })
    }));
    
    await syncToGithub();
    
    expect(mockCreateOrUpdate).toHaveBeenCalled();
  });
  
  test('应该检测文件内容变化', () => {
    const content1 = '{"test": "data1"}';
    const content2 = '{"test": "data2"}';
    const content3 = '{"test": "data1"}';
    
    // 写入不同内容
    fs.writeFileSync(testFilePath, content1);
    const stats1 = fs.statSync(testFilePath);
    
    fs.writeFileSync(testFilePath, content2);
    const stats2 = fs.statSync(testFilePath);
    
    fs.writeFileSync(testFilePath, content3);
    const stats3 = fs.statSync(testFilePath);
    
    // 验证文件确实被修改了
    expect(stats1.mtime.getTime()).not.toBe(stats2.mtime.getTime());
    expect(stats2.mtime.getTime()).not.toBe(stats3.mtime.getTime());
  });
}); 