import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface Message {
  role: string;
  content: string;
}

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}

const initialState: ChatState = {
  messages: [],
  isLoading: false,
  error: null,
};

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    addMessage: (state, action: PayloadAction<Message>) => {
      state.messages.push(action.payload);
      state.error = null;
    },
    updateLastMessage: (state, action: PayloadAction<string>) => {
      if (state.messages.length > 0) {
        state.messages[state.messages.length - 1].content = action.payload;
      }
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    clearMessages: (state) => {
      state.messages = [];
      state.error = null;
    },
    setMessages: (state, action: PayloadAction<Message[]>) => {
      state.messages = action.payload;
    },
  },
});

export const {
  addMessage,
  updateLastMessage,
  setLoading,
  setError,
  clearMessages,
  setMessages,
} = chatSlice.actions;
export default chatSlice.reducer;
