import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Alert,
  ActivityIndicator, ScrollView, TouchableOpacity, Image, Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { addExpense, uploadReceipt } from '../api/expenses';
import { theme } from '../theme';
import { Ionicons } from '@expo/vector-icons'; // Assuming Ionicons is available in Expo by default

export default function AddExpenseScreen() {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);

  const { accessToken } = useAuth();
  const navigation = useNavigation();

  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert("Permission to access camera roll is required!");
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
        Alert.alert("Permission to access camera is required!");
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
        Alert.alert("Processing", "Uploading and analyzing receipt...");
        const data = await uploadReceipt(uri, accessToken);
        if (data.cost) setAmount(String(data.cost));
        if (data.description) setDescription(data.description);
        if (data.category) setCategory(data.category);
        if (data.sub_category) setSubCategory(data.sub_category);
        if (data.date) setDate(data.date);
        Alert.alert("Success", "Receipt parsed successfully!");
    } catch (error) {
        Alert.alert("Error", "Failed to parse receipt. Please enter details manually.");
    } finally {
        setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!description || !amount || !category) {
      Alert.alert('Error', 'Please fill in required fields');
      return;
    }

    if (!accessToken) return;

    setLoading(true);
    try {
      await addExpense({
        description,
        cost: parseFloat(amount),
        category,
        sub_category: subCategory,
        date,
      }, accessToken);

      Alert.alert('Success', 'Expense added successfully!');
      setDescription('');
      setAmount('');
      setCategory('');
      setSubCategory('');
      setImage(null);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to save expense');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={styles.header}>
        <Text style={theme.typography.h2}>Add Expense</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Receipt (Optional)</Text>

        {image ? (
            <View style={styles.imagePreviewContainer}>
                <Image source={{ uri: image }} style={styles.previewImage} />
                <TouchableOpacity onPress={() => setImage(null)} style={styles.removeImageBtn}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>X</Text>
                </TouchableOpacity>
            </View>
        ) : (
            <View style={styles.uploadRow}>
                <TouchableOpacity style={styles.uploadBtn} onPress={handlePickImage}>
                    <Text style={styles.uploadText}>Upload</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.uploadBtn} onPress={handleTakePhoto}>
                    <Text style={styles.uploadText}>Camera</Text>
                </TouchableOpacity>
            </View>
        )}
      </View>

      <View style={styles.formContainer}>
          <Text style={styles.label}>Amount</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
            placeholderTextColor="#999"
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={styles.input}
            placeholder="Grocery, Taxi, etc."
            value={description}
            onChangeText={setDescription}
            placeholderTextColor="#999"
          />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.label}>Category</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Food"
                    value={category}
                    onChangeText={setCategory}
                    placeholderTextColor="#999"
                />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.label}>Sub Category</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Optional"
                    value={subCategory}
                    onChangeText={setSubCategory}
                    placeholderTextColor="#999"
                />
            </View>
          </View>

          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            value={date}
            onChangeText={setDate}
            placeholderTextColor="#999"
          />

          <TouchableOpacity
            style={[styles.submitBtn, loading && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Save Expense</Text>}
          </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
  },
  header: {
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 15,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  uploadRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 15,
      width: '100%',
  },
  uploadBtn: {
      backgroundColor: '#F3E5F5',
      paddingVertical: 12,
      paddingHorizontal: 25,
      borderRadius: 25,
      borderWidth: 1,
      borderColor: theme.colors.primaryLight,
  },
  uploadText: {
      color: theme.colors.primary,
      fontWeight: '600',
  },
  imagePreviewContainer: {
      position: 'relative',
      width: '100%',
      height: 200,
      borderRadius: 12,
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
      width: 30,
      height: 30,
      borderRadius: 15,
      justifyContent: 'center',
      alignItems: 'center',
  },
  formContainer: {
      backgroundColor: '#fff',
      borderRadius: 20,
      padding: 25,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
      elevation: 5,
  },
  row: {
      flexDirection: 'row',
      marginBottom: 15,
  },
  label: {
      fontSize: 12,
      fontWeight: 'bold',
      color: theme.colors.textSecondary,
      marginBottom: 8,
      marginLeft: 5,
  },
  input: {
      backgroundColor: '#F9F9F9',
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 15,
      fontSize: 16,
      color: '#333',
      marginBottom: 20,
  },
  submitBtn: {
      backgroundColor: theme.colors.primary,
      paddingVertical: 16,
      borderRadius: 30,
      alignItems: 'center',
      marginTop: 10,
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 5,
  },
  submitText: {
      color: '#fff',
      fontSize: 18,
      fontWeight: 'bold',
  }
});
