const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'Gmail', // e.g., 'Gmail' or 'Outlook'
  auth: {
    user: 'reflectica.ai@gmail.com',
    pass: process.env.GMAIL_PASS_KEY,
  },
});

const sendLoopMail = async (email) => {
  const mailOptions = {
    from: 'reflectica.ai@gmail.com',
    to: email,
    subject: `Thank You For Subscribing To Our Loop`,
    text: `We will keep you in the loop! Stay tuned!`,
  };

  await transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
    } else {
      console.log('Email sent:', info.response);
    }
  });
}
  
const sendSupportMail = async (firstName, lastName, email, phoneNumber, message) => {
  const mailOptions = {
    from: 'reflectica.ai@gmail.com',
    to: 'reflectica.ai@gmail.com',
    subject: `Support Mail from ${firstName} ${lastName}`,
    text: `Hi Reflica Team, we have a new support mail. Customers phone number is ${phoneNumber} and their email adress is ${email}. Their message is ${message}`,
  };

  await transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
    } else {
      console.log('Email sent:', info.response);
    }
  });
}

const registerEmailForLoopIntoDb = async (email) => {
  const checkIfEmailExistAlready = await checkForExistingData(email)
  if(checkIfEmailExistAlready) {
    // Data to be added to the document
    const data = {
      email: email
    };
    await subscribedEmails.add(data)
    .then((docRef) => {
      console.log('Document written with ID: ', docRef.id);
    })
    .catch((error) => {
      console.error('Error adding document: ', error);
    });
  await sendLoopMail(email)
  return 
  }
}

module.exports = {
  transporter,
  sendLoopMail,
  sendSupportMail,
  registerEmailForLoopIntoDb
}