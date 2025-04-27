/*global chrome*/

import {
  Box,
  Button,
  CircularProgress,
  Typography,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Snackbar,
  Alert,
  Paper,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material';
import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

function App() {
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const predefinedApiUrls = [
    { name: 'OpenAI Official', url: 'https://api.openai.com/v1' },
    { name: 'Custom', url: 'Custom' }
  ];
  const [apiUrl, setApiUrl] = useState('https://api.openai.com/v1');
  const [apiUrlType, setApiUrlType] = useState('https://api.openai.com/v1');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [showCustomUrl, setShowCustomUrl] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [loadingModels, setLoadingModels] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [debugLogs, setDebugLogs] = useState([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const debugLogRef = useRef([]);

  // Logging function
  const logDebug = (type, message, data = null) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      type,
      message,
      data: data ? JSON.parse(JSON.stringify(data)) : null
    };
    
    // Add to state for UI display
    setDebugLogs(prev => [...prev, logEntry]);
    
    // Also keep in ref for downloading
    debugLogRef.current.push(logEntry);
    
    // Log to console in development
    console.log(`[${timestamp}] [${type}]`, message, data || '');
  };

  const getValidLengthText = (text) => {
    const validLength = 4 * 3200;
    if (debugMode) {
      logDebug('INFO', `Truncating content from ${text.length} to ${validLength} characters`);
    }
    return text.substring(0, validLength);
  };

  const showNotification = (message, severity = 'info') => {
    if (debugMode) {
      logDebug('NOTIFICATION', message, { severity });
    }
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const copyToClipboard = () => {
    if (debugMode) logDebug('ACTION', 'Copying summary to clipboard');
    navigator.clipboard.writeText(summary)
      .then(() => showNotification('Summary copied to clipboard!', 'success'))
      .catch((error) => {
        if (debugMode) logDebug('ERROR', 'Failed to copy to clipboard', { error: error.message });
        showNotification('Failed to copy to clipboard', 'error');
      });
  };

  const downloadLogs = () => {
    try {
      const logs = debugLogRef.current;
      const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `summarizer-logs-${new Date().toISOString().replace(/:/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showNotification('Debug logs downloaded successfully', 'success');
    } catch (error) {
      console.error('Error downloading logs:', error);
      showNotification('Failed to download logs', 'error');
    }
  };

  const clearLogs = () => {
    setDebugLogs([]);
    debugLogRef.current = [];
    showNotification('Debug logs cleared', 'info');
  };

  async function getCurrentTabHtml() {
    if (debugMode) logDebug('ACTION', 'Getting current tab HTML');
    
    try {
      let queryOptions = { active: true, currentWindow: true };
      const tabs = await chrome.tabs.query(queryOptions);
      
      if (debugMode) logDebug('INFO', 'Tab query result', { tabCount: tabs?.length });
      
      if (!tabs || tabs.length === 0) {
        const error = new Error('No active tab found');
        if (debugMode) logDebug('ERROR', error.message);
        throw error;
      }

      if (debugMode) logDebug('INFO', 'Active tab details', { 
        tabId: tabs[0].id,
        url: tabs[0].url,
        title: tabs[0].title
      });

      let result;
      try {
        [{ result }] = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => document.documentElement.innerText,
        });
        
        if (debugMode) logDebug('INFO', 'Script execution successful', { 
          contentLength: result?.length || 0,
          contentPreview: result?.substring(0, 100) + '...' 
        });
      } catch (e) {
        if (debugMode) logDebug('ERROR', 'Script execution error', { error: e.message, stack: e.stack });
        console.error('Script execution error:', e);
        throw new Error(`Cannot access page content: ${e.message}`);
      }

      return result || '';
    } catch (error) {
      if (debugMode) logDebug('ERROR', 'Error getting tab HTML', { error: error.message, stack: error.stack });
      console.error('Error getting tab HTML:', error);
      throw error;
    }
  }

  const fetchSummary = async () => {
    if (debugMode) logDebug('ACTION', 'Starting summary generation');
    
    if (!apiKey) {
      if (debugMode) logDebug('WARNING', 'API key not set');
      showNotification('Please set your API key in settings', 'warning');
      setSettingsOpen(true);
      return;
    }

    if (!selectedModel) {
      if (debugMode) logDebug('WARNING', 'Model not selected');
      showNotification('Please select a model in settings', 'warning');
      setSettingsOpen(true);
      return;
    }

    setLoading(true);
    setSummary('');

    try {
      // Get and parse inner html of active tab
      if (debugMode) logDebug('INFO', 'Fetching page content');
      const tabInnerHtmlText = await getCurrentTabHtml();
      
      if (!tabInnerHtmlText || tabInnerHtmlText.trim() === '') {
        const error = new Error('No content found on this page');
        if (debugMode) logDebug('ERROR', error.message);
        throw error;
      }
      
      const validPrompt = getValidLengthText(tabInnerHtmlText);
      
      const effectiveUrl = apiUrlType === 'Custom' ? apiUrl : apiUrlType;
      if (debugMode) logDebug('INFO', 'Preparing API request', { 
        apiUrl: effectiveUrl,
        model: selectedModel,
        promptLength: validPrompt.length
      });
      
      const requestBody = {
        model: selectedModel,
        prompt:
          `Think step by step and provide a clear, concise, yet comprehensive summary of the provided content. Your task is to distil the content into a structured written format, using markdown for readability and organization. 

          In your summary, please ensure to:

          1. **Include the content's main title**: This will set the context and provide an idea about the content, if available.
          2. **Identify and summarize the key points/highlights**: List out the primary points, arguments, discoveries, or themes presented in the content. Consider these as the "need-to-know" points for understanding the content's core message/content.
          3. **Provide detail without losing clarity**: After the key points, provide a more detailed summary. Include significant sub-points, illustrative examples, discussions, and any conclusions or implications. Aim for this detailed section to complement and expand on the key points, but ensure it remains digestible and clear.
          4. **Structure your summary with markdown**: Use headers for different sections (e.g., Key Points, Detailed Summary), bullet points for listing items, bold or italic text for emphasis, and tables where appropriate.
          5. **Capture the content's essence without unnecessary length**: Strive for a balance of detail and brevity. Capture all the necessary information, but avoid overly long sentences and excessive detail.
          
          Remember, the goal is to ensure that someone who reads your summary will gain a complete and accurate understanding of the content, even if they haven't watched it themselves.
          If the content includes visual elements crucial to its understanding (like a graph, diagram, or scene description), please describe it briefly within the relevant part of the summary.

          Here's a template to guide your summary:
          # [title]

          ## TLDR
          (Provide a short summary of the content in a maximum of 3 sentences)

          ## Key Points/Highlights
          - Main Point/Highlight 1
          - Main Point/Highlight 2
          - ...

          ## Detailed Summary
          (Expand on the key points with sub-points, examples, discussions, conclusions or implications)

          ## Conclusion
          (Any conclusions made in the content, the final thoughts of the speaker, etc.)` +
          `The content is as follows: ${validPrompt}`,
        temperature: 0.7,
        max_tokens: 500,
        top_p: 1.0,
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
      };
      
      if (debugMode) {
        // Log request details but mask the API key and truncate the prompt
        const sanitizedRequestBody = {...requestBody};
        sanitizedRequestBody.prompt = sanitizedRequestBody.prompt.substring(0, 200) + '... [TRUNCATED]';
        logDebug('API_REQUEST', 'Sending API request', { 
          url: `${effectiveUrl}/completions`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer [MASKED]'
          },
          body: sanitizedRequestBody
        });
      }

      const startTime = Date.now();
      const response = await fetch(`${effectiveUrl}/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      const endTime = Date.now();
      
      if (debugMode) logDebug('INFO', 'API response received', { 
        status: response.status,
        statusText: response.statusText,
        responseTime: `${endTime - startTime}ms`
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (debugMode) logDebug('ERROR', 'API request failed', { 
          status: response.status,
          errorData
        });
        throw new Error(
          errorData.error?.message || 
          `API request failed with status ${response.status}`
        );
      }

      const data = await response.json();
      if (debugMode) logDebug('API_RESPONSE', 'API response data', data);
      
      if (!data.choices || !data.choices[0] || !data.choices[0].text) {
        if (debugMode) logDebug('ERROR', 'Invalid API response format', data);
        throw new Error('Invalid response format from API');
      }
      
      setSummary(data.choices[0].text);
      if (debugMode) logDebug('SUCCESS', 'Summary generated successfully', { 
        summaryLength: data.choices[0].text.length,
        summaryPreview: data.choices[0].text.substring(0, 100) + '...'
      });
      showNotification('Summary generated successfully!', 'success');
    } catch (error) {
      if (debugMode) logDebug('ERROR', 'Summarization error', { 
        message: error.message,
        stack: error.stack
      });
      console.error('Summarization error:', error);
      setSummary(`Error: ${error.message}`);
      showNotification(`Failed to generate summary: ${error.message}`, 'error');
    } finally {
      setLoading(false);
      if (debugMode) logDebug('INFO', 'Summary generation process completed');
    }
  };

  const fetchModels = async () => {
    if (debugMode) logDebug('ACTION', 'Fetching available models');
    
    if (!apiKey) {
      if (debugMode) logDebug('WARNING', 'API key not set');
      showNotification('Please enter your API key first', 'warning');
      return;
    }
    
    if (!apiUrl && apiUrlType === 'Custom') {
      if (debugMode) logDebug('WARNING', 'Custom API URL not set');
      showNotification('Please enter a valid API URL', 'warning');
      return;
    }
    
    setLoadingModels(true);
    
    try {
      const effectiveUrl = apiUrlType === 'Custom' ? apiUrl : apiUrlType;
      if (debugMode) logDebug('INFO', 'Preparing models API request', { 
        apiUrl: effectiveUrl
      });
      
      const startTime = Date.now();
      const response = await fetch(`${effectiveUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      const endTime = Date.now();
      
      if (debugMode) logDebug('INFO', 'Models API response received', { 
        status: response.status,
        statusText: response.statusText,
        responseTime: `${endTime - startTime}ms`
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (debugMode) logDebug('ERROR', 'Models API request failed', { 
          status: response.status,
          errorData
        });
        throw new Error(
          errorData.error?.message || 
          `Failed to fetch models (Status: ${response.status})`
        );
      }
      
      const data = await response.json();
      if (debugMode) logDebug('API_RESPONSE', 'Models API response data', data);
      
      if (!data.data || !Array.isArray(data.data)) {
        if (debugMode) logDebug('ERROR', 'Invalid models API response format', data);
        throw new Error('Invalid response format from API');
      }
      
      const sortedModels = data.data.sort(
        (a, b) => new Date(b.created) - new Date(a.created)
      );
      
      if (debugMode) logDebug('INFO', 'Models sorted and processed', { 
        modelCount: sortedModels.length,
        firstFewModels: sortedModels.slice(0, 3).map(m => m.id)
      });
      
      setModels(sortedModels);
      showNotification('Models loaded successfully', 'success');
      
      // Auto-select first model if none selected
      if (sortedModels.length > 0 && !selectedModel) {
        if (debugMode) logDebug('INFO', 'Auto-selecting first model', { modelId: sortedModels[0].id });
        setSelectedModel(sortedModels[0].id);
      }
    } catch (error) {
      if (debugMode) logDebug('ERROR', 'Error fetching models', { 
        message: error.message,
        stack: error.stack
      });
      console.error('Error fetching models:', error);
      showNotification(`Failed to fetch models: ${error.message}`, 'error');
      setModels([]);
    } finally {
      setLoadingModels(false);
      if (debugMode) logDebug('INFO', 'Models fetch process completed');
    }
  };

  useEffect(() => {
    chrome.storage.sync.get(['apiKey', 'apiUrl', 'selectedModel', 'apiUrlType', 'debugMode'], (result) => {
      console.log('Loaded settings:', result);
      if (result.apiKey) setApiKey(result.apiKey);
      if (result.apiUrl) setApiUrl(result.apiUrl);
      if (result.selectedModel) setSelectedModel(result.selectedModel);
      if (result.apiUrlType) {
        setApiUrlType(result.apiUrlType);
        setShowCustomUrl(result.apiUrlType === 'Custom');
      }
      if (result.debugMode !== undefined) setDebugMode(result.debugMode);
      
      // Log settings loaded
      if (result.debugMode) {
        logDebug('INFO', 'Settings loaded from storage', {
          apiUrlType: result.apiUrlType,
          hasApiKey: !!result.apiKey,
          hasCustomUrl: !!result.apiUrl,
          selectedModel: result.selectedModel,
          debugMode: result.debugMode
        });
      }
    });
  }, []);

  // Auto-fetch models when API key and URL are set
  useEffect(() => {
    if (apiKey && (apiUrlType !== 'Custom' || apiUrl)) {
      if (debugMode) logDebug('INFO', 'Auto-fetching models on startup');
      fetchModels();
    }
  }, [apiKey, apiUrl, apiUrlType, debugMode]);

  const saveSettings = () => {
    const effectiveApiUrl = apiUrlType === 'Custom' ? apiUrl : apiUrlType;
    
    const settings = {
      apiKey,
      apiUrl: apiUrl, // Store the actual custom URL
      selectedModel,
      apiUrlType,
      debugMode
    };
    
    if (debugMode) logDebug('ACTION', 'Saving settings', {
      apiUrlType,
      hasApiKey: !!apiKey,
      hasCustomUrl: !!apiUrl,
      selectedModel,
      debugMode
    });
    
    console.log('Saving settings:', settings);
    chrome.storage.sync.set(settings, () => {
      console.log('Settings saved to storage');
      showNotification('Settings saved successfully', 'success');
      setSettingsOpen(false);
      
      // Fetch models after saving settings if we have the necessary data
      if (apiKey && effectiveApiUrl) {
        fetchModels();
      }
    });
  };

  const handleApiUrlTypeChange = (e) => {
    const value = e.target.value;
    console.log('API URL type changed:', value);
    setApiUrlType(value);
    setShowCustomUrl(value === 'Custom');
    if (value !== 'Custom') {
      setApiUrl(''); // Clear custom URL when switching to predefined
    }
    
    // Reset models when changing API URL type
    setModels([]);
    setSelectedModel('');
  };

  return (
    <Box
      sx={{
        width: '350px',
        height: '500px',
        display: 'flex',
        flexDirection: 'column',
        padding: '12px',
        backgroundColor: '#f5f5f5',
      }}
    >
      <Paper elevation={2} sx={{ padding: '12px', mb: 2 }}>
        <Typography
          sx={{
            fontSize: 24,
            fontWeight: '600',
            color: '#00ab01',
            textAlign: 'center',
          }}
        >
          SummarizerNG
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: '#555',
            textAlign: 'center',
            mb: 2,
          }}
        >
          Get an AI-powered summary of this web page
        </Typography>
        
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 1 }}>
          <Tooltip title="Settings">
            <Button 
              variant='outlined' 
              onClick={() => setSettingsOpen(true)}
              size="small"
            >
              ⚙️ Settings
            </Button>
          </Tooltip>
          
          <Button
            variant="contained"
            sx={{
              backgroundColor: '#00ab01',
              color: 'white',
              '&:hover': {
                backgroundColor: '#008c01',
              },
              '&.Mui-disabled': {
                backgroundColor: '#cccccc',
              }
            }}
            onClick={fetchSummary}
            disabled={loading || !selectedModel || !apiKey}
            size="small"
          >
            {loading ? <CircularProgress size={20} color='inherit' /> : '📝'} {loading ? 'Processing...' : 'Summarize'}
          </Button>
        </Box>
      </Paper>

      <Paper 
        elevation={1} 
        sx={{ 
          flex: 1, 
          padding: '12px', 
          overflowY: 'auto',
          position: 'relative',
          backgroundColor: summary ? '#fff' : '#f9f9f9'
        }}
      >
        {summary && (
          <Tooltip title="Copy to clipboard">
            <IconButton 
              size="small" 
              sx={{ position: 'absolute', top: 5, right: 5 }}
              onClick={copyToClipboard}
            >
              📋
            </IconButton>
          </Tooltip>
        )}
        
        {!summary && !loading && (
          <Typography
            sx={{
              color: '#666',
              textAlign: 'center',
              fontSize: 14,
              mt: 8
            }}
          >
            Click "Summarize" to generate a summary of the current page
          </Typography>
        )}
        
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress color="success" />
          </Box>
        )}
        
        {summary && (
          <Box
            sx={{
              fontSize: 13,
              color: '#212429',
              textAlign: 'justify',
              paddingRight: '20px', // Space for copy button
            }}
            className="markdown-body"
          >
            <ReactMarkdown>{summary}</ReactMarkdown>
          </Box>
        )}
      </Paper>

      <Dialog 
        open={settingsOpen} 
        onClose={() => setSettingsOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>API Settings</DialogTitle>
        <DialogContent dividers>
          <TextField
            select
            fullWidth
            label='API Provider'
            value={apiUrlType}
            onChange={handleApiUrlTypeChange}
            margin='normal'
            variant="outlined"
            size="small"
          >
            {predefinedApiUrls.map((option) => (
              <MenuItem key={option.url} value={option.url}>
                {option.name}
              </MenuItem>
            ))}
          </TextField>
          
          {showCustomUrl && (
            <TextField
              fullWidth
              label='Custom API URL'
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              margin='normal'
              placeholder="https://your-custom-api-url.com/v1"
              variant="outlined"
              size="small"
              helperText="Enter the base URL for your API endpoint"
            />
          )}
          
          <TextField
            fullWidth
            label='API Key'
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            margin='normal'
            type='password'
            variant="outlined"
            size="small"
            required
            helperText="Your API key is stored locally and never shared"
          />
          
          <Divider sx={{ my: 2 }} />
          
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle2" sx={{ mr: 1 }}>
              Available Models:
            </Typography>
            <Button 
              onClick={fetchModels} 
              variant="outlined" 
              size="small"
              disabled={loadingModels || !apiKey || (showCustomUrl && !apiUrl)}
            >
              {loadingModels ? <CircularProgress size={20} /> : '🔄 Refresh Models'}
            </Button>
          </Box>
          
          <TextField
            select
            fullWidth
            label='Model'
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            margin='normal'
            disabled={models.length === 0}
            variant="outlined"
            size="small"
            helperText={models.length === 0 ? "Click 'Refresh Models' to load available models" : ""}
          >
            {models.map((model) => (
              <MenuItem key={model.id} value={model.id}>
                {model.id}
              </MenuItem>
            ))}
          </TextField>
          
          <Divider sx={{ my: 2 }} />
          
          <Typography variant="subtitle1" gutterBottom>
            Debug Options
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Typography variant="body2" sx={{ mr: 2 }}>
              Enable Debug Mode:
            </Typography>
            <Button 
              variant={debugMode ? "contained" : "outlined"}
              color={debugMode ? "success" : "primary"}
              size="small"
              onClick={() => setDebugMode(!debugMode)}
            >
              {debugMode ? "Enabled" : "Disabled"}
            </Button>
          </Box>
          
          {debugMode && (
            <>
              <Typography variant="body2" color="text.secondary" paragraph sx={{ mt: 1 }}>
                Debug mode logs API requests, responses, and extension actions. Logs are stored only in memory and cleared when the extension is closed.
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Button 
                  variant="outlined" 
                  size="small"
                  onClick={downloadLogs}
                  disabled={debugLogRef.current.length === 0}
                >
                  📥 Download Logs
                </Button>
                
                <Button 
                  variant="outlined" 
                  size="small"
                  onClick={clearLogs}
                  disabled={debugLogRef.current.length === 0}
                  color="error"
                >
                  🗑️ Clear Logs
                </Button>
                
                <Button 
                  variant="outlined" 
                  size="small"
                  onClick={() => setDebugOpen(true)}
                >
                  🔍 View Logs
                </Button>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)} color="inherit">Cancel</Button>
          <Button 
            onClick={saveSettings} 
            variant="contained" 
            color="primary"
            disabled={!apiKey || (showCustomUrl && !apiUrl)}
          >
            Save Settings
          </Button>
        </DialogActions>
      </Dialog>
      
      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleCloseSnackbar} 
          severity={snackbar.severity} 
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
      
      {/* Debug Logs Dialog */}
      <Dialog
        open={debugOpen}
        onClose={() => setDebugOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          Debug Logs
          <IconButton
            aria-label="close"
            onClick={() => setDebugOpen(false)}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
            }}
          >
            ❌
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Box sx={{ 
            height: '400px', 
            overflowY: 'auto',
            backgroundColor: '#1e1e1e',
            color: '#f0f0f0',
            fontFamily: 'monospace',
            fontSize: '12px',
            p: 1
          }}>
            {debugLogs.length === 0 ? (
              <Typography sx={{ color: '#888', p: 2, textAlign: 'center' }}>
                No logs recorded yet. Enable debug mode and perform actions to see logs.
              </Typography>
            ) : (
              debugLogs.map((log, index) => (
                <Box key={index} sx={{ mb: 1, p: 1, borderBottom: '1px solid #333' }}>
                  <Box sx={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    mb: 0.5
                  }}>
                    <Typography sx={{ 
                      color: log.type === 'ERROR' ? '#ff6b6b' : 
                             log.type === 'WARNING' ? '#ffd166' :
                             log.type === 'SUCCESS' ? '#06d6a0' :
                             log.type === 'API_REQUEST' ? '#118ab2' :
                             log.type === 'API_RESPONSE' ? '#073b4c' : '#f0f0f0'
                    }}>
                      [{log.timestamp}] [{log.type}]
                    </Typography>
                  </Box>
                  <Typography sx={{ ml: 2, wordBreak: 'break-word' }}>
                    {log.message}
                  </Typography>
                  {log.data && (
                    <Box 
                      component="pre" 
                      sx={{ 
                        ml: 2, 
                        p: 1, 
                        backgroundColor: 'rgba(0,0,0,0.3)',
                        borderRadius: 1,
                        overflowX: 'auto',
                        fontSize: '11px'
                      }}
                    >
                      {JSON.stringify(log.data, null, 2)}
                    </Box>
                  )}
                </Box>
              ))
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={downloadLogs} disabled={debugLogs.length === 0}>
            📥 Download Logs
          </Button>
          <Button onClick={clearLogs} disabled={debugLogs.length === 0} color="error">
            🗑️ Clear Logs
          </Button>
          <Button onClick={() => setDebugOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default App;
