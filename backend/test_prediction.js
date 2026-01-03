const axios = require('axios');

// Configure axios to use the local backend
const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  timeout: 10000,
});

async function testPrediction() {
  console.log('🧪 Testing CKD Risk Prediction API...\n');

  // Test Case 1: Low Risk (Young, Normal BP, Normal Sugar)
  console.log('Test 1: Low Risk Patient');
  try {
    const response1 = await api.post('/predict', {
      age: 25,
      bp_systolic: 115,
      bp_diastolic: 70,
      diabetes_level: 90,
    });
    console.log('✅ Response:', response1.data);
  } catch (error) {
    console.log('❌ Error:', error.response?.data || error.message);
    if (error.code) console.log('   Error Code:', error.code);
    if (error.response?.status) console.log('   Status:', error.response.status);
  }

  console.log('\n---\n');

  // Test Case 2: Medium Risk (Middle-aged, Elevated BP, Prediabetic)
  console.log('Test 2: Medium Risk Patient');
  try {
    const response2 = await api.post('/predict', {
      age: 45,
      bp_systolic: 135,
      bp_diastolic: 85,
      diabetes_level: 110,
    });
    console.log('✅ Response:', response2.data);
  } catch (error) {
    console.log('❌ Error:', error.response?.data || error.message);
  }

  console.log('\n---\n');

  // Test Case 3: High Risk (Senior, High BP, Diabetic)
  console.log('Test 3: High Risk Patient');
  try {
    const response3 = await api.post('/predict', {
      age: 70,
      bp_systolic: 160,
      bp_diastolic: 95,
      diabetes_level: 180,
    });
    console.log('✅ Response:', response3.data);
  } catch (error) {
    console.log('❌ Error:', error.response?.data || error.message);
  }

  console.log('\n---\n');

  // Test Case 4: Using Boolean Diabetes Flag (Backward Compatibility)
  console.log('Test 4: Using Boolean Diabetes Flag');
  try {
    const response4 = await api.post('/predict', {
      age: 50,
      bp_systolic: 140,
      bp_diastolic: 90,
      diabetes: true,
    });
    console.log('✅ Response:', response4.data);
  } catch (error) {
    console.log('❌ Error:', error.response?.data || error.message);
  }

  console.log('\n---\n');

  // Test Case 5: Missing Required Fields
  console.log('Test 5: Missing Required Fields (Should Fail)');
  try {
    const response5 = await api.post('/predict', {
      diabetes: true,
    });
    console.log('❌ Should have failed but got:', response5.data);
  } catch (error) {
    console.log('✅ Expected Error:', error.response?.data || error.message);
  }

  console.log('\n✅ All tests completed!');
}

// Run tests
testPrediction().catch(error => {
  console.error('Fatal Error:', error);
  process.exit(1);
});
