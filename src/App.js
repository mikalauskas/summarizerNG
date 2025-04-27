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
import { useState, useEffect } from 'react';

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

  const getValidLengthText = (text) => {
    const validLength = 4 * 3200;
    return text.substring(0, validLength);
  };

  const showNotification = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(summary)
      .then(() => showNotification('Summary copied to clipboard!', 'success'))
      .catch(() => showNotification('Failed to copy to clipboard', 'error'));
  };

  async function getCurrentTabHtml() {
    try {
      let queryOptions = { active: true, currentWindow: true };
      const tabs = await chrome.tabs.query(queryOptions);
      
      if (!tabs || tabs.length === 0) {
        throw new Error('No active tab found');
      }

      let result;
      try {
        [{ result }] = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => document.documentElement.innerText,
        });
      } catch (e) {
        console.error('Script execution error:', e);
        throw new Error(`Cannot access page content: ${e.message}`);
      }

      return result || '';
    } catch (error) {
      console.error('Error getting tab HTML:', error);
      throw error;
    }
  }

  const fetchSummary = async () => {
    if (!apiKey) {
      showNotification('Please set your API key in settings', 'warning');
      setSettingsOpen(true);
      return;
    }

    if (!selectedModel) {
      showNotification('Please select a model in settings', 'warning');
      setSettingsOpen(true);
      return;
    }

    setLoading(true);
    setSummary('');

    try {
      // Get and parse inner html of active tab
      const tabInnerHtmlText = await getCurrentTabHtml();
      
      if (!tabInnerHtmlText || tabInnerHtmlText.trim() === '') {
        throw new Error('No content found on this page');
      }
      
      const validPrompt = getValidLengthText(tabInnerHtmlText);

      const effectiveUrl = apiUrlType === 'Custom' ? apiUrl : apiUrlType;
      const response = await fetch(`${effectiveUrl}/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
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
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message || 
          `API request failed with status ${response.status}`
        );
      }

      const data = await response.json();
      setSummary(data.choices[0].text);
      showNotification('Summary generated successfully!', 'success');
    } catch (error) {
      console.error('Summarization error:', error);
      setSummary(`Error: ${error.message}`);
      showNotification(`Failed to generate summary: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchModels = async () => {
    if (!apiKey) {
      showNotification('Please enter your API key first', 'warning');
      return;
    }
    
    if (!apiUrl && apiUrlType === 'Custom') {
      showNotification('Please enter a valid API URL', 'warning');
      return;
    }
    
    setLoadingModels(true);
    
    try {
      const effectiveUrl = apiUrlType === 'Custom' ? apiUrl : apiUrlType;
      const response = await fetch(`${effectiveUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message || 
          `Failed to fetch models (Status: ${response.status})`
        );
      }
      
      const data = await response.json();
      
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid response format from API');
      }
      
      const sortedModels = data.data.sort(
        (a, b) => new Date(b.created) - new Date(a.created)
      );
      
      setModels(sortedModels);
      showNotification('Models loaded successfully', 'success');
      
      // Auto-select first model if none selected
      if (sortedModels.length > 0 && !selectedModel) {
        setSelectedModel(sortedModels[0].id);
      }
    } catch (error) {
      console.error('Error fetching models:', error);
      showNotification(`Failed to fetch models: ${error.message}`, 'error');
      setModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    chrome.storage.sync.get(['apiKey', 'apiUrl', 'selectedModel', 'apiUrlType'], (result) => {
      console.log('Loaded settings:', result);
      if (result.apiKey) setApiKey(result.apiKey);
      if (result.apiUrl) setApiUrl(result.apiUrl);
      if (result.selectedModel) setSelectedModel(result.selectedModel);
      if (result.apiUrlType) {
        setApiUrlType(result.apiUrlType);
        setShowCustomUrl(result.apiUrlType === 'Custom');
      }
    });
  }, []);

  // Auto-fetch models when API key and URL are set
  useEffect(() => {
    if (apiKey && (apiUrlType !== 'Custom' || apiUrl)) {
      fetchModels();
    }
  }, []);

  const saveSettings = () => {
    const effectiveApiUrl = apiUrlType === 'Custom' ? apiUrl : apiUrlType;
    
    const settings = {
      apiKey,
      apiUrl: apiUrl, // Store the actual custom URL
      selectedModel,
      apiUrlType
    };
    
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
          <Typography
            sx={{
              fontSize: 13,
              color: '#212429',
              textAlign: 'justify',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              paddingRight: '20px', // Space for copy button
            }}
          >
            {summary}
          </Typography>
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
    </Box>
  );
}

export default App;
