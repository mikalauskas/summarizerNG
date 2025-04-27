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
} from '@mui/material';
import { useState, useEffect } from 'react';
import { Configuration, OpenAIApi } from 'openai';

function App() {
  const [text, setText] = useState();
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState('https://api.openai.com/v1');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');

  const getValidLengthText = (text) => {
    const validLength = 4 * 3200;
    return text.substr(0, validLength);
  };

  async function getCurrentTabHtml() {
    let queryOptions = { active: true, currentWindow: true };
    const tabs = await chrome.tabs.query(queryOptions);

    let result;
    try {
      [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => document.documentElement.innerText,
      });
    } catch (e) {
      console.log(e);
    }

    return result;
  }

  const fetchSummary = async () => {
    setLoading(true);

    // Get and parse inner html of active tab
    const tabInnerHtmlText = await getCurrentTabHtml();
    const validPrompt = getValidLengthText(tabInnerHtmlText);

    try {
      const response = await fetch(`${apiUrl}/completions`, {
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
          max_tokens: 300,
          top_p: 1.0,
          frequency_penalty: 0.0,
          presence_penalty: 0.0,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      setText(data.choices[0].text);
    } catch (error) {
      setText(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchModels = async () => {
    try {
      const response = await fetch(`${apiUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      const sortedModels = data.data.sort(
        (a, b) => new Date(b.created) - new Date(a.created)
      );
      setModels(sortedModels);
    } catch (error) {
      setText('Failed to fetch models. Check your API settings.');
    }
  };

  useEffect(() => {
    chrome.storage.sync.get(['apiKey', 'apiUrl'], (result) => {
      if (result.apiKey) setApiKey(result.apiKey);
      if (result.apiUrl) setApiUrl(result.apiUrl);
    });
  }, []);

  const saveSettings = () => {
    chrome.storage.sync.set({ apiKey, apiUrl }, () => {
      setSettingsOpen(false);
      fetchModels();
    });
  };

  return (
    <Box
      sx={{
        width: '300px',
        height: '500px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <Typography
        sx={{
          fontSize: 25,
          fontWeight: '550',
          color: '#00ab01',
          textAlign: 'center',
          marginTop: '10px',
        }}
      >
        Summarizer
      </Typography>
      <Typography
        sx={{
          fontSize: 15,
          fontWeight: '550',
          color: '#212429',
          textAlign: 'center',
          marginTop: '10px',
        }}
      >
        Get summary of this web page
      </Typography>
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button variant='outlined' onClick={() => setSettingsOpen(true)}>
          Settings
        </Button>
        <Button
          sx={{
            fontSize: 16,
            backgroundColor: '#00ab01',
            color: 'white',
            '&:hover': {
              backgroundColor: 'white',
              color: '#00ab01',
            },
          }}
          onClick={fetchSummary}
          disabled={!selectedModel}
        >
          {loading ? <CircularProgress color='inherit' /> : <>Summarize</>}
        </Button>
      </Box>

      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <DialogTitle>API Settings</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label='API URL'
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            margin='normal'
          />
          <TextField
            fullWidth
            label='API Key'
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            margin='normal'
            type='password'
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>Cancel</Button>
          <Button onClick={saveSettings}>Save</Button>
        </DialogActions>
      </Dialog>
      <Typography
        sx={{
          padding: '3px',
          fontSize: 12,
          fontWeight: '500',
          color: '#212429',
          textAlign: 'justify',
          marginTop: '20px',
        }}
      >
        {text}
      </Typography>
    </Box>
  );
}

export default App;
