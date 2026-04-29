import React from 'react';
import { Modal } from './Modal';

interface LicenseModalProps {
  onClose: () => void;
}

export const LicenseModal: React.FC<LicenseModalProps> = ({ onClose }) => {
  return (
    <Modal
      onClose={onClose}
      title="License"
      maxWidth="600px"
      ariaLabel="Close License"
    >
      <div className="license-text">
{`MIT License

Copyright (c) 2026 Michael Krisper

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`}
      </div>

      <p className="license-note">
        This software is free to use, modify, and distribute, provided that the original copyright notice and this permission notice are included in all copies or substantial portions of the Software.
      </p>
    </Modal>
  );
};
