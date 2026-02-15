import React, { useState } from 'react';
import {
  View, Text, TextInput, Button, StyleSheet, Alert,
  ActivityIndicator, ScrollView, TouchableOpacity, Image
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { addExpense, uploadReceipt } from '../api/expenses';

export default function AddExpenseScreen() {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);

  const { accessToken } = useAuth();
  const navigation = useNavigation<any>();

  const handlePickImage = async () => {
    // Request permission (implicit in Expo usually, but good practice)
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
        // Auto-fill fields from OCR result
        if (data.cost) setAmount(String(data.cost));
        if (data.description) setDescription(data.description);
        if (data.category) setCategory(data.category);
        if (data.sub_category) setSubCategory(data.sub_category);
        if (data.date) setDate(data.date);
        Alert.alert("Success", "Receipt parsed successfully!");
    } catch (error) {
        Alert.alert("Error", "Failed to parse receipt. Please enter details manually.");
        console.error(error);
    } finally {
        setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!description || !amount || !category) {
      Alert.alert('Error', 'Please fill in required fields (Description, Amount, Category)');
      return;
    }

    if (!accessToken) {
        Alert.alert('Error', 'Not authenticated');
        return;
    }

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
      // Reset form
      setDescription('');
      setAmount('');
      setCategory('');
      setSubCategory('');
      setImage(null);
      // Navigate to Dashboard to see the update
      navigation.navigate('Dashboard');
    } catch (error) {
      Alert.alert('Error', 'Failed to save expense');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.label}>Receipt (Optional)</Text>
      <View style={styles.imageButtons}>
          <Button title="Pick from Gallery" onPress={handlePickImage} />
          <View style={{width: 10}} />
          <Button title="Take Photo" onPress={handleTakePhoto} />
      </View>

      {image && (
          <Image source={{ uri: image }} style={styles.previewImage} />
      )}

      <Text style={styles.label}>Amount *</Text>
      <TextInput
        style={styles.input}
        placeholder="0.00"
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
      />

      <Text style={styles.label}>Description *</Text>
      <TextInput
        style={styles.input}
        placeholder="Grocery, Taxi, etc."
        value={description}
        onChangeText={setDescription}
      />

      <Text style={styles.label}>Category *</Text>
      <TextInput
        style={styles.input}
        placeholder="Food, Transport, etc."
        value={category}
        onChangeText={setCategory}
      />

      <Text style={styles.label}>Sub Category</Text>
      <TextInput
        style={styles.input}
        placeholder="Optional"
        value={subCategory}
        onChangeText={setSubCategory}
      />

      <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.input}
        placeholder="2023-01-01"
        value={date}
        onChangeText={setDate}
      />

      <View style={styles.submitContainer}>
        {loading ? (
            <ActivityIndicator size="large" />
        ) : (
            <Button title="Save Expense" onPress={handleSubmit} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  imageButtons: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginBottom: 10,
  },
  previewImage: {
      width: '100%',
      height: 200,
      resizeMode: 'contain',
      marginBottom: 10,
      borderWidth: 1,
      borderColor: '#ddd',
  },
  submitContainer: {
      marginTop: 20,
      marginBottom: 40,
  }
});
