# End user of the mobile app. Accounts are optional; they only enable cloud sync.
class User < ApplicationRecord
  include Devise::JWT::RevocationStrategies::JTIMatcher

  devise :database_authenticatable, :registerable, :recoverable, :rememberable, :validatable,
         :jwt_authenticatable, jwt_revocation_strategy: self

  has_many :rooms, dependent: :destroy
  has_many :saved_remotes, dependent: :destroy
  has_many :scenes, dependent: :destroy
  has_many :config_submissions, dependent: :nullify
  has_many :match_reports, dependent: :nullify

  validates :name, length: { maximum: 80 }, allow_blank: true

  # Reset mail carries a deep link/token for the app instead of a Devise web route.
  def send_devise_notification(notification, *args)
    if notification == :reset_password_instructions
      UserMailer.reset_password(self, args.first).deliver_later
    else
      super
    end
  end

  def touch_last_seen!
    update_column(:last_seen_at, Time.current) if last_seen_at.nil? || last_seen_at < 10.minutes.ago
  end
end
