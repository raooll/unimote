class UserMailer < ApplicationMailer
  def reset_password(user, token)
    @user = user
    @token = token
    @link = "#{ENV.fetch('APP_LINK_BASE', 'unimote://reset-password')}?token=#{token}"
    mail(to: user.email, subject: "Reset your Unimote password")
  end
end
