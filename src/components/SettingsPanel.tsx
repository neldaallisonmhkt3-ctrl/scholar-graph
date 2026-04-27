import { useState, useEffect, useCallback } from 'react';
import { db } from '@/db';
import type { ModelProvider } from '@/types';
import { v4 as uuid } from 'uuid';
import { PRESET_PROVIDERS } from '@/services/llm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Plus, Trash2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

interface SettingsPanelProps {
  onBack: () => void;
}

export function SettingsPanel({ onBack }: SettingsPanelProps) {
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [savedFeedback, setSavedFeedback] = useState<Record<string, boolean>>({});

  const loadProviders = useCallback(async () => {
    const list = await db.modelProviders.toArray();
    setProviders(list);
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // 添加预设Provider
  const handleAddPreset = useCallback(
    async (preset: Omit<ModelProvider, 'id' | 'apiKey'>) => {
      const provider: ModelProvider = {
        ...preset,
        id: uuid(),
        apiKey: '',
      };
      await db.modelProviders.add(provider);
      await loadProviders();
    },
    [loadProviders]
  );

  // 更新API Key
  const handleUpdateKey = useCallback(
    async (id: string, apiKey: string) => {
      await db.modelProviders.update(id, { apiKey });
      setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, apiKey } : p)));
      // 显示保存成功反馈
      setSavedFeedback((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => setSavedFeedback((prev) => ({ ...prev, [id]: false })), 2000);
    },
    []
  );

  // 更新默认模型
  const handleUpdateModel = useCallback(
    async (id: string, defaultModel: string) => {
      await db.modelProviders.update(id, { defaultModel });
      setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, defaultModel } : p)));
      setSavedFeedback((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => setSavedFeedback((prev) => ({ ...prev, [id]: false })), 2000);
    },
    []
  );

  // 更新BaseUrl
  const handleUpdateBaseUrl = useCallback(
    async (id: string, baseUrl: string) => {
      await db.modelProviders.update(id, { baseUrl });
      setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, baseUrl } : p)));
      setSavedFeedback((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => setSavedFeedback((prev) => ({ ...prev, [id]: false })), 2000);
    },
    []
  );

  // 删除Provider
  const handleDelete = useCallback(
    async (id: string) => {
      await db.modelProviders.delete(id);
      await loadProviders();
    },
    [loadProviders]
  );

  // 切换Key可见性
  const toggleKeyVisibility = useCallback((id: string) => {
    setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // 已添加的provider类型
  const addedProviderTypes = new Set(providers.map((p) => p.provider));
  const availablePresets = PRESET_PROVIDERS.filter((p) => !addedProviderTypes.has(p.provider));

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="h-14 flex items-center gap-3 px-4 border-b border-border">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h2 className="text-sm font-semibold">模型设置</h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto p-6 space-y-6">
          {/* 说明 */}
          <div className="text-xs text-muted-foreground leading-relaxed bg-muted/50 rounded-lg p-3">
            配置你常用的大模型 API Key。所有请求均从你的浏览器直接发出，Key 不会上传到任何服务器。
            <br />
            至少配置一个模型即可使用 AI 讲解和问答功能。
          </div>

          {/* 已配置的Provider */}
          {providers.map((provider) => (
            <div key={provider.id} className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{provider.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleDelete(provider.id)}
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>

              {/* API Key */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">API Key</label>
                <div className="flex gap-2">
                  <Input
                    type={showKeys[provider.id] ? 'text' : 'password'}
                    value={provider.apiKey}
                    onChange={(e) => handleUpdateKey(provider.id, e.target.value)}
                    placeholder="输入你的 API Key"
                    className="text-sm font-mono"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => toggleKeyVisibility(provider.id)}
                  >
                    {showKeys[provider.id] ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                  {savedFeedback[provider.id] && provider.apiKey && (
                    <span className="flex items-center gap-1 text-xs text-green-500 shrink-0 whitespace-nowrap">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      已保存
                    </span>
                  )}
                </div>
              </div>

              {/* 模型选择 */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">模型</label>
                <Select
                  value={provider.defaultModel}
                  onValueChange={(v) => handleUpdateModel(provider.id, v)}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {provider.models.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Base URL */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">API 地址</label>
                <Input
                  value={provider.baseUrl}
                  onChange={(e) => handleUpdateBaseUrl(provider.id, e.target.value)}
                  className="text-sm font-mono"
                />
              </div>
            </div>
          ))}

          {/* 添加新Provider */}
          {availablePresets.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">添加模型</p>
              <div className="flex flex-wrap gap-2">
                {availablePresets.map((preset) => (
                  <Button
                    key={preset.provider}
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1"
                    onClick={() => handleAddPreset(preset)}
                  >
                    <Plus className="w-3 h-3" />
                    {preset.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {providers.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">尚未配置任何模型</p>
              <p className="text-xs text-muted-foreground/60 mt-1">点击上方按钮添加你常用的模型</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
