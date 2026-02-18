import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Alert,
  ScrollView, TouchableOpacity, Image, Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { addExpense, uploadReceipt } from '../api/expenses';
import { theme } from '../theme';
import ScreenWrapper from '../components/ScreenWrapper';
import Card from '../components/Card';
import CustomInput from '../components/CustomInput';
import CustomButton from '../components/CustomButton';
import { showToast } from '../components/Toast';

const CATEGORIES = ['Food', 'Groceries', 'Transport', 'Entertainment', 'Shopping', 'Health', 'Utilities', 'Rent', 'Travel', 'Education', 'Other'];

export default function AddExpenseScreen() {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);

  const { accessToken, userEmail } = useAuth();
  const navigation = useNavigation();

  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      showToast({ message: 'Permission to access photos is required', type: 'warning' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImage(result.assets[0].uri);
      await parseReceipt(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (permissionResult.granted === false) {
      showToast({ message: 'Permission to access camera is required', type: 'warning' });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImage(result.assets[0].uri);
      await parseReceipt(result.assets[0].uri);
    }
  };

  const parseReceipt = async (uri: string) => {
    if (!accessToken) return;
    setLoading(true);
    try {
      showToast({ message: 'Analyzing receipt...', type: 'info' });
      const data = await uploadReceipt(uri, accessToken);
      if (data.cost) setAmount(String(data.cost));
      if (data.description) setDescription(data.description);
      if (data.category) setCategory(data.category);
      if (data.sub_category) setSubCategory(data.sub_category);
      if (data.date) setDate(data.date);
      showToast({ message: 'Receipt parsed successfully!', type: 'success' });
    } catch (error) {
      showToast({ message: 'Could not parse receipt. Enter details manually.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!description || !amount || !category) {
      showToast({ message: 'Please fill in required fields', type: 'warning' });
      return;
    }

    if (!accessToken || !userEmail) return;

    setLoading(true);
    try {
      await addExpense(
        {
          description,
          cost: parseFloat(amount),
          category,
          sub_category: subCategory,
          date,
          user_id: userEmail,
        },
        accessToken,
      );

      showToast({ message: 'Expense added successfully! 🎉', type: 'success' });
      setDescription('');
      setAmount('');
      setCategory('');
      setSubCategory('');
      setImage(null);
      navigation.goBack();
    } catch (error) {
      showToast({ message: 'Failed to save expense', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrapper scroll>
      <Text style={theme.typography.h2}>Add Expense</Text>
      <Text style={styles.subtitle}>Track your spending</Text>

      {/* Receipt Upload Card */}
      <Card style={styles.receiptCard}>
        <Text style={styles.cardLabel}>RECEIPT (OPTIONAL)</Text>
        {image ? (
          <View style={styles.imagePreview}>
            <Image source={{ uri: image }} style={styles.previewImage} />
            <TouchableOpacity
              onPress={() => setImage(null)}
              style={styles.removeImageBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.removeX}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.uploadRow}>
            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={handlePickImage}
              activeOpacity={0.7}
            >
              <Text style={styles.uploadEmoji}>🖼️</Text>
              <Text style={styles.uploadLabel}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={handleTakePhoto}
              activeOpacity={0.7}
            >
              <Text style={styles.uploadEmoji}>📷</Text>
              <Text style={styles.uploadLabel}>Camera</Text>
            </TouchableOpacity>
          </View>
        )}
      </Card>

      {/* Expense Form */}
      <Card>
        <CustomInput
          label="Amount"
          icon="💰"
          placeholder="0.00"
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />

        <CustomInput
          label="Description"
          icon="📝"
          placeholder="What was this expense for?"
          value={description}
          onChangeText={setDescription}
        />

        {/* Category Chips */}
        <Text style={styles.chipLabel}>CATEGORY</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipContainer}
        >
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.chip,
                category === cat && styles.chipActive,
              ]}
              onPress={() => setCategory(cat)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chipText,
                  category === cat && styles.chipTextActive,
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <CustomInput
          label="Sub Category"
          icon="📂"
          placeholder="Optional"
          value={subCategory}
          onChangeText={setSubCategory}
        />

        <CustomInput
          label="Date"
          icon="📅"
          placeholder="YYYY-MM-DD"
          value={date}
          onChangeText={setDate}
        />

        <CustomButton
          title="Save Expense"
          onPress={handleSubmit}
          loading={loading}
          icon="💾"
          style={{ marginTop: 8 }}
        />
      </Card>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    marginTop: 4,
    marginBottom: 20,
  },
  receiptCard: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 16,
  },
  uploadRow: {
    flexDirection: 'row',
    gap: 16,
  },
  uploadBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySurface,
    borderWidth: 1.5,
    borderColor: theme.colors.primaryLight,
    borderStyle: 'dashed',
    minWidth: 100,
  },
  uploadEmoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  uploadLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  imagePreview: {
    position: 'relative',
    width: '100%',
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removeImageBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeX: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 10,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  chipScroll: {
    marginBottom: 18,
    marginLeft: -4,
  },
  chipContainer: {
    gap: 8,
    paddingLeft: 4,
    paddingRight: 16,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    minHeight: 40,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
});
