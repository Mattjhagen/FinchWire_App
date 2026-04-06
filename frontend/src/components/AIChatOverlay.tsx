import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { colors, spacing, typography, borderRadius, shadows } from '../utils/theme';
import { apiService } from '../services/api';
import { TypingIndicator } from './TypingIndicator';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

export function AIChatOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  
  const animatedValue = useRef(new Animated.Value(0)).current;

  const toggleOpen = () => {
    const toValue = isOpen ? 0 : 1;
    setIsOpen(!isOpen);
    
    Animated.spring(animatedValue, {
      toValue,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();

    if (isOpen) {
      Keyboard.dismiss();
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isAsking) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsAsking(true);

    try {
      const response = await apiService.runAiSearch(text);
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: response.answer || 'I am sorry, I could not generate an answer right now.',
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: 'Connection to AI failed. Please try again.',
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsAsking(false);
    }
  };

  const translateY = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT, 0],
  });

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  if (!isOpen && animatedValue.valueOf() === 0) {
    return (
      <TouchableOpacity 
        style={styles.fab} 
        onPress={toggleOpen}
        activeOpacity={0.8}
      >
        <BlurView intensity={80} style={styles.fabBlur}>
          <Ionicons name="chatbubble-ellipses" size={24} color={colors.primary} />
        </BlurView>
      </TouchableOpacity>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View 
        style={[styles.backdrop, { opacity }]} 
        pointerEvents={isOpen ? 'auto' : 'none'}
      >
        <TouchableOpacity style={styles.backdropPress} onPress={toggleOpen} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <BlurView intensity={95} tint="dark" style={styles.sheetBlur}>
          <View style={styles.header}>
            <View style={styles.headerInfo}>
              <View style={styles.aiBadge}>
                <Ionicons name="sparkles" size={12} color={colors.primary} />
              </View>
              <Text style={styles.headerTitle}>FinchWire AI</Text>
            </View>
            <TouchableOpacity onPress={toggleOpen} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.chatArea}
            contentContainerStyle={styles.chatContent}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="bulb-outline" size={48} color={colors.textTertiary} />
                <Text style={styles.emptyText}>How can I help you today?</Text>
                <Text style={styles.emptySub}>Ask about news, media, or settings.</Text>
              </View>
            ) : (
              messages.map(msg => (
                <View 
                  key={msg.id} 
                  style={[
                    styles.bubble,
                    msg.role === 'user' ? styles.userBubble : styles.assistantBubble
                  ]}
                >
                  <Text style={[
                    styles.bubbleText,
                    msg.role === 'user' ? styles.userText : styles.assistantText
                  ]}>
                    {msg.text}
                  </Text>
                </View>
              ))
            )}
            {isAsking && <TypingIndicator />}
          </ScrollView>

          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={20}
          >
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="Ask anything..."
                placeholderTextColor={colors.textTertiary}
                multiline
                maxLength={500}
                editable={!isAsking}
              />
              <TouchableOpacity 
                style={[styles.sendBtn, (!input.trim() || isAsking) && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={!input.trim() || isAsking}
              >
                <Ionicons name="send" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </BlurView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 90, // Above tab bar
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    ...shadows.lg,
    zIndex: 999,
  },
  fabBlur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  backdropPress: {
    flex: 1,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.7,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    overflow: 'hidden',
    zIndex: 1000,
  },
  sheetBlur: {
    flex: 1,
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  aiBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  headerTitle: {
    ...typography.h3,
    fontSize: 18,
  },
  closeBtn: {
    padding: 4,
  },
  chatArea: {
    flex: 1,
    marginVertical: spacing.md,
  },
  chatContent: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.h3,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptySub: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  bubble: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    maxWidth: '85%',
  },
  userBubble: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 2,
  },
  assistantBubble: {
    backgroundColor: colors.surface,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: {
    ...typography.bodySmall,
    lineHeight: 20,
  },
  userText: {
    color: '#fff',
  },
  assistantText: {
    color: colors.text,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    ...typography.bodySmall,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    maxHeight: 100,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
});
