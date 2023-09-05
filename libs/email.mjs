import nodemailer from 'nodemailer'
import dotenv from 'dotenv'
dotenv.config()

const {EMAIL_USER, EMAIL_PASSWORD, USE_EMAIL} = process.env;

let transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASSWORD
  }
})

export function sendApprovalRequest(to, tag, user_nickname, user_email) {
  if (USE_EMAIL) {
    const mailOptions = {
      to,
      from: 'help@dataventures.nz',
      subject: `You have a signup waiting for approval for ${tag}`,
      text: `You are receiving this email as an admin for the ${tag} organisation.
${user_nickname} (${user_email}) has accepted the invite, and is asking for access to ${tag}
Please login to the admin tool and accept or reject this user from your organisation,
Data Ventures Support`
    }
    transporter.sendMail(mailOptions, function(error, info){
      if (error) {
        console.log(error);
      } else {
        console.log('Email sent: ' + info.response);
      }
    })
  } else {
    console.log("Would have emailed if email was turned on.")
  }
}

export function welcomeToHavingAnAccount(to, password, user_nickname, tags) {
  if (USE_EMAIL) {
    const mailOptions = {
      to,
      from: 'help@dataventures.nz',
      subject: `Hey ${user_nickname}, you now have an account on the tourism nz server`,
      text: `the password is ${password}, please change it at some point soon.`
    }
    transporter.sendMail(mailOptions, function(error, info){
      if (error) {
        console.log(error);
      } else {
        console.log('Email sent: ' + info.response);
      }
    })
  } else {
    console.log("Would have emailed if email was turned on.")
  }
}
